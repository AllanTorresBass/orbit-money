import type { PoolClient } from "pg";
import { canConfigure } from "@/lib/auth/session";
import type { MembershipRole } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db/connection";
import { fromCents, toCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { BaseService } from "@/lib/services/base/BaseService";

export interface PlanEnvelopeDto {
  id: string;
  name: string;
  tierCategory: "fixed" | "sinking" | "discretionary";
  priorityOrder: number;
  balanceCents: number;
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
}

export interface PlanPurchaseDto {
  id: string;
  amountCents: number;
  memo: string | null;
  bookedAt: string;
}

export interface EnvelopePayload {
  name: string;
  tierCategory: "fixed" | "sinking";
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
  dueDate?: string | null;
  amountEachPaydayCents?: number | null;
}

export interface ProposalDto {
  id: string;
  envelopeId: string | null;
  proposedBy: string;
  proposedByName: string;
  payload: EnvelopePayload;
  status: string;
  createdAt: string;
}

export class PlanService extends BaseService {
  constructor() {
    super("PlanService");
  }

  async getPlan(
    tenantId: string,
    userId: string,
  ): Promise<{
    bills: PlanEnvelopeDto[];
    goals: PlanEnvelopeDto[];
    spending: PlanEnvelopeDto | null;
    recentPurchases: PlanPurchaseDto[];
  }> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const envelopes = await client.query<{
        id: string;
        name: string;
        tier_category: "fixed" | "sinking" | "discretionary";
        priority_order: number;
        current_balance: string;
        target_cap: string | null;
        monthly_installment: string | null;
      }>(
        `SELECT id, name, tier_category, priority_order, current_balance::text,
                target_cap::text, monthly_installment::text
         FROM envelopes
         WHERE tenant_id = $1
         ORDER BY tier_category, priority_order`,
        [tenantId],
      );

      const mapped = envelopes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tierCategory: row.tier_category,
        priorityOrder: row.priority_order,
        balanceCents: toCents(row.current_balance),
        targetCapCents: row.target_cap === null ? null : toCents(row.target_cap),
        monthlyInstallmentCents:
          row.monthly_installment === null ? null : toCents(row.monthly_installment),
      }));

      const spending = mapped.find((e) => e.tierCategory === "discretionary") ?? null;
      const purchases = spending
        ? await client.query<{
            id: string;
            amount: string;
            memo: string | null;
            booked_at: string;
          }>(
            `SELECT id, amount::text, memo, booked_at::text
             FROM transactions
             WHERE tenant_id = $1 AND envelope_id = $2 AND amount < 0
             ORDER BY booked_at DESC
             LIMIT 5`,
            [tenantId, spending.id],
          )
        : { rows: [] };

      return {
        bills: mapped.filter((e) => e.tierCategory === "fixed"),
        goals: mapped.filter((e) => e.tierCategory === "sinking" && e.name !== "Emergency"),
        spending,
        recentPurchases: purchases.rows.map((p) => ({
          id: p.id,
          amountCents: Math.abs(toCents(p.amount)),
          memo: p.memo,
          bookedAt: p.booked_at,
        })),
      };
    });
  }

  async createEnvelope(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    payload: EnvelopePayload;
  }): Promise<{ id: string } | { proposalId: string }> {
    if (canConfigure(input.role)) {
      return withTransaction(
        { tenantId: input.tenantId, userId: input.userId },
        async (client) => {
          const id = await this.insertEnvelope(client, input.tenantId, input.payload);
          await runEvaluationPipeline(client, {
            tenantId: input.tenantId,
            userId: input.userId,
            trigger: "sync",
          });
          this.logInfo("Envelope created", { id });
          return { id };
        },
      );
    }

    if (input.role !== "member") {
      throw new Error("Forbidden");
    }

    return withTransaction(
      { tenantId: input.tenantId, userId: input.userId },
      async (client) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO envelope_proposals (tenant_id, envelope_id, proposed_by, payload, status)
           VALUES ($1, NULL, $2, $3::jsonb, 'pending')
           RETURNING id`,
          [input.tenantId, input.userId, JSON.stringify(input.payload)],
        );
        this.logInfo("Envelope proposed", { proposalId: result.rows[0].id });
        return { proposalId: result.rows[0].id };
      },
    );
  }

  async listProposals(tenantId: string, userId: string, role: MembershipRole): Promise<ProposalDto[]> {
    if (!canConfigure(role)) {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId, userId }, async (client) => {
      const result = await client.query<{
        id: string;
        envelope_id: string | null;
        proposed_by: string;
        name: string;
        payload: EnvelopePayload;
        status: string;
        created_at: string;
      }>(
        `SELECT p.id, p.envelope_id, p.proposed_by, u.name, p.payload, p.status, p.created_at::text
         FROM envelope_proposals p
         JOIN users u ON u.id = p.proposed_by
         WHERE p.tenant_id = $1 AND p.status = 'pending'
         ORDER BY p.created_at ASC`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        envelopeId: row.envelope_id,
        proposedBy: row.proposed_by,
        proposedByName: row.name,
        payload: row.payload,
        status: row.status,
        createdAt: row.created_at,
      }));
    });
  }

  async resolveProposal(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    proposalId: string;
    decision: "accepted" | "rejected";
  }): Promise<void> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }

    await withTransaction(
      { tenantId: input.tenantId, userId: input.userId },
      async (client) => {
        const proposal = await client.query<{
          id: string;
          proposed_by: string;
          envelope_id: string | null;
          payload: EnvelopePayload;
          status: string;
        }>(
          `SELECT id, proposed_by, envelope_id, payload, status
           FROM envelope_proposals
           WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [input.proposalId, input.tenantId],
        );
        const row = proposal.rows[0];
        if (!row || row.status !== "pending") {
          throw new Error("Not found");
        }
        if (row.proposed_by === input.userId) {
          throw new Error("Forbidden");
        }

        if (input.decision === "accepted") {
          if (row.envelope_id) {
            await client.query(
              `UPDATE envelopes
               SET name = $1,
                   target_cap = $2,
                   monthly_installment = $3
               WHERE id = $4 AND tenant_id = $5`,
              [
                row.payload.name,
                row.payload.targetCapCents === null
                  ? null
                  : fromCents(row.payload.targetCapCents),
                row.payload.monthlyInstallmentCents === null
                  ? null
                  : fromCents(row.payload.monthlyInstallmentCents),
                row.envelope_id,
                input.tenantId,
              ],
            );
          } else {
            await this.insertEnvelope(client, input.tenantId, row.payload);
          }
        }

        await client.query(
          `UPDATE envelope_proposals
           SET status = $1, resolved_by = $2, resolved_at = NOW()
           WHERE id = $3`,
          [input.decision, input.userId, input.proposalId],
        );

        if (input.decision === "accepted") {
          await runEvaluationPipeline(client, {
            tenantId: input.tenantId,
            userId: input.userId,
            trigger: "sync",
          });
        }
      },
    );
  }

  private async insertEnvelope(
    client: PoolClient,
    tenantId: string,
    payload: EnvelopePayload,
  ): Promise<string> {
    const priorityRes = await client.query<{ max: number | null }>(
      `SELECT MAX(priority_order) AS max FROM envelopes
       WHERE tenant_id = $1 AND tier_category = $2`,
      [tenantId, payload.tierCategory],
    );
    const nextPriority = (priorityRes.rows[0]?.max ?? 0) + 1;
    const rollover = payload.tierCategory === "fixed" ? "top_up" : "accumulate";
    const capCents =
      payload.targetCapCents ??
      payload.amountEachPaydayCents ??
      null;
    const installment =
      payload.tierCategory === "sinking" ? payload.monthlyInstallmentCents : null;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO envelopes
         (tenant_id, name, tier_category, priority_order, current_balance,
          target_cap, monthly_installment, rollover_policy)
       VALUES ($1, $2, $3, $4, 0.00, $5, $6, $7)
       RETURNING id`,
      [
        tenantId,
        payload.name,
        payload.tierCategory,
        nextPriority,
        capCents === null ? null : fromCents(capCents),
        installment === null ? null : fromCents(installment),
        rollover,
      ],
    );

    const envelopeId = inserted.rows[0].id;

    if (payload.tierCategory === "fixed" && payload.dueDate && capCents !== null) {
      const account = await client.query<{ id: string }>(
        `SELECT id FROM accounts WHERE tenant_id = $1 ORDER BY is_everyday DESC LIMIT 1`,
        [tenantId],
      );
      if (account.rows[0]) {
        await client.query(
          `INSERT INTO scheduled_schedules
             (tenant_id, envelope_id, account_id, title, amount, direction,
              recurrence_rrule, next_due_date, is_active)
           VALUES ($1, $2, $3, $4, $5, 'outflow', 'FREQ=MONTHLY', $6::date, TRUE)`,
          [
            tenantId,
            envelopeId,
            account.rows[0].id,
            payload.name,
            fromCents(capCents),
            payload.dueDate,
          ],
        );
      }
    }

    return envelopeId;
  }
}

export const planService = new PlanService();
