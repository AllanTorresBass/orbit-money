import type { PoolClient } from "pg";
import { canConfigure, type MembershipRole } from "@/lib/auth/permissions";
import { lockTenantForUpdate } from "@/lib/db/advisory-lock";
import { withTransaction } from "@/lib/db/connection";
import { fromCents, toCents } from "@/lib/money/numeric";
import { effectiveInflowDate, loadTenantHolidays } from "@/lib/calendar/inflow-dates";
import { todayInTimezone } from "@/lib/calendar/dates";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { BaseService } from "@/lib/services/base/BaseService";
import {
  ConflictError,
  NotFoundError,
} from "@/lib/errors/service-errors";
import type {
  EnvelopeMoveResult,
  EnvelopePayload,
  EnvelopeRemovalResult,
  PlanDto,
  PlanPaydayDto,
  ProposalDto,
  ScheduleMutationResult,
  UpdateScheduleBody,
} from "@/types/plan/plan.types";

export class PlanService extends BaseService {
  constructor() {
    super("PlanService");
  }

  async getPlan(tenantId: string, userId: string): Promise<PlanDto> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const envelopes = await client.query<{
        id: string;
        name: string;
        tier_category: "fixed" | "sinking" | "discretionary";
        priority_order: number;
        current_balance: string;
        target_cap: string | null;
        monthly_installment: string | null;
        sweep_envelope_id: string | null;
      }>(
        `SELECT id, name, tier_category, priority_order, current_balance::text,
                target_cap::text, monthly_installment::text, sweep_envelope_id
         FROM envelopes
         WHERE tenant_id = $1 AND archived_at IS NULL
         ORDER BY tier_category, priority_order`,
        [tenantId],
      );

      // A bill's due date comes from its outflow schedule.
      // The earliest active schedule per bill is the one a payment settles.
      const dueDates = await client.query<{
        envelope_id: string;
        id: string;
        amount: string;
        next_due_date: string;
      }>(
        `SELECT DISTINCT ON (envelope_id) envelope_id, id, amount::text,
                next_due_date::text AS next_due_date
         FROM scheduled_schedules
         WHERE tenant_id = $1 AND direction = 'outflow' AND is_active = TRUE
           AND envelope_id IS NOT NULL
         ORDER BY envelope_id, next_due_date ASC, id ASC`,
        [tenantId],
      );
      const dueByEnvelope = new Map(dueDates.rows.map((r) => [r.envelope_id, r]));

      const mapped = envelopes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tierCategory: row.tier_category,
        priorityOrder: row.priority_order,
        balanceCents: toCents(row.current_balance),
        targetCapCents: row.target_cap === null ? null : toCents(row.target_cap),
        monthlyInstallmentCents:
          row.monthly_installment === null ? null : toCents(row.monthly_installment),
        nextDueDate: dueByEnvelope.get(row.id)?.next_due_date ?? null,
        scheduleId: dueByEnvelope.get(row.id)?.id ?? null,
        dueAmountCents: dueByEnvelope.has(row.id)
          ? toCents(dueByEnvelope.get(row.id)?.amount ?? "0")
          : null,
      }));

      const spending = mapped.find((e) => e.tierCategory === "discretionary") ?? null;
      // Hide the sink Spending sweeps into (usually Emergency) by id, never by name.
      const sweepSinkId =
        envelopes.rows.find((e) => e.tier_category === "discretionary")?.sweep_envelope_id ?? null;
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
               AND NOT EXISTS (
                 SELECT 1 FROM transactions r
                 WHERE r.tenant_id = transactions.tenant_id
                   AND r.reverses_transaction_id = transactions.id
               )
             ORDER BY booked_at DESC
             LIMIT 5`,
            [tenantId, spending.id],
          )
        : { rows: [] };

      const payday = await client.query<{ id: string; amount: string; next_due_date: string }>(
        `SELECT id, amount::text, next_due_date::text
         FROM scheduled_schedules
         WHERE tenant_id = $1 AND direction = 'inflow' AND is_active = TRUE
         ORDER BY next_due_date ASC
         LIMIT 1`,
        [tenantId],
      );
      const paydayRow = payday.rows[0];
      let paydayDto: PlanPaydayDto | null = null;
      if (paydayRow) {
        // Show the day the deposit lands: a weekend payday arrives the business day before (D11).
        const tenant = await client.query<{ timezone: string; holiday_region: string }>(
          `SELECT timezone, holiday_region FROM tenants WHERE id = $1`,
          [tenantId],
        );
        const holidays = loadTenantHolidays(
          tenant.rows[0]?.holiday_region ?? "US",
          todayInTimezone(tenant.rows[0]?.timezone ?? "UTC"),
        );
        paydayDto = {
          amountCents: toCents(paydayRow.amount),
          date: effectiveInflowDate(paydayRow.next_due_date, holidays),
          scheduleId: paydayRow.id,
        };
      }

      const sweep = await client.query<{ incomplete: boolean }>(
        `SELECT incomplete FROM cycle_sweeps
         WHERE tenant_id = $1
         ORDER BY cycle_end_date DESC
         LIMIT 1`,
        [tenantId],
      );

      return {
        payday: paydayDto,
        sweepIncomplete: sweep.rows[0]?.incomplete ?? false,
        bills: mapped.filter((e) => e.tierCategory === "fixed"),
        goals: mapped.filter(
          (e) => e.tierCategory === "sinking" && (sweepSinkId === null || e.id !== sweepSinkId),
        ),
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

  async reorderEnvelopes(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    tierCategory: "fixed" | "sinking";
    orderedIds: string[];
  }): Promise<void> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    await withTransaction(
      { tenantId: input.tenantId, userId: input.userId },
      async (client) => {
        const existing = await client.query<{ id: string; hidden: boolean }>(
          `SELECT e.id,
                  EXISTS (
                    SELECT 1 FROM envelopes s
                    WHERE s.tenant_id = e.tenant_id AND s.sweep_envelope_id = e.id
                  ) AS hidden
           FROM envelopes e
           WHERE e.tenant_id = $1 AND e.tier_category = $2 AND e.archived_at IS NULL
           ORDER BY e.priority_order ASC`,
          [input.tenantId, input.tierCategory],
        );
        // The goal Spending sweeps into is hidden on Plan, so the screen never sends it.
        // It keeps its slot; the visible rows fill the others in the order given.
        const visibleIds = existing.rows.filter((r) => !r.hidden).map((r) => r.id);
        if (
          visibleIds.length !== input.orderedIds.length ||
          [...visibleIds].sort().join() !== [...input.orderedIds].sort().join()
        ) {
          throw new Error("Validation failed");
        }
        let nextVisible = 0;
        const fullOrder = existing.rows.map((r) =>
          r.hidden ? r.id : input.orderedIds[nextVisible++],
        );

        // Two-phase update avoids unique (tenant, tier, priority) collisions.
        for (let i = 0; i < fullOrder.length; i += 1) {
          await client.query(
            `UPDATE envelopes SET priority_order = $1
             WHERE id = $2 AND tenant_id = $3`,
            [-(i + 1), fullOrder[i], input.tenantId],
          );
        }
        for (let i = 0; i < fullOrder.length; i += 1) {
          await client.query(
            `UPDATE envelopes SET priority_order = $1
             WHERE id = $2 AND tenant_id = $3`,
            [i + 1, fullOrder[i], input.tenantId],
          );
        }

        await runEvaluationPipeline(client, {
          tenantId: input.tenantId,
          userId: input.userId,
          trigger: "sync",
        });
      },
    );
  }

  async updateEnvelope(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    envelopeId: string;
    payload: EnvelopePayload;
  }): Promise<{ id: string } | { proposalId: string }> {
    if (canConfigure(input.role)) {
      return withTransaction(
        { tenantId: input.tenantId, userId: input.userId },
        async (client) => {
          const existing = await client.query<{ id: string; tier_category: string }>(
            `SELECT id, tier_category FROM envelopes
             WHERE id = $1 AND tenant_id = $2 AND tier_category IN ('fixed', 'sinking')
               AND archived_at IS NULL`,
            [input.envelopeId, input.tenantId],
          );
          if (!existing.rows[0]) {
            throw new Error("Not found");
          }

          await client.query(
            `UPDATE envelopes
             SET name = $1,
                 target_cap = $2,
                 monthly_installment = $3
             WHERE id = $4 AND tenant_id = $5`,
            [
              input.payload.name,
              input.payload.targetCapCents === null
                ? null
                : fromCents(input.payload.targetCapCents),
              input.payload.monthlyInstallmentCents === null
                ? null
                : fromCents(input.payload.monthlyInstallmentCents),
              input.envelopeId,
              input.tenantId,
            ],
          );

          if (
            existing.rows[0].tier_category === "fixed" &&
            input.payload.dueDate &&
            (input.payload.targetCapCents ?? input.payload.amountEachPaydayCents) !== null
          ) {
            const amount =
              input.payload.amountEachPaydayCents ?? input.payload.targetCapCents ?? 0;
            await client.query(
              `UPDATE scheduled_schedules
               SET title = $1, amount = $2, next_due_date = $3::date
               WHERE tenant_id = $4 AND envelope_id = $5 AND direction = 'outflow'`,
              [
                input.payload.name,
                fromCents(amount),
                input.payload.dueDate,
                input.tenantId,
                input.envelopeId,
              ],
            );
          }

          await runEvaluationPipeline(client, {
            tenantId: input.tenantId,
            userId: input.userId,
            trigger: "sync",
          });
          this.logInfo("Envelope updated", { id: input.envelopeId });
          return { id: input.envelopeId };
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
           VALUES ($1, $2, $3, $4::jsonb, 'pending')
           RETURNING id`,
          [
            input.tenantId,
            input.envelopeId,
            input.userId,
            JSON.stringify(input.payload),
          ],
        );
        return { proposalId: result.rows[0].id };
      },
    );
  }

  /**
   * Take a bill or goal off the Plan. Owner and admin only.
   * - Its schedules turn off, so nothing is funded or projected for it any more.
   * - With nothing set aside, the envelope is archived and leaves the Plan.
   * - A bill that still holds money stays (schedules off only) so no cents vanish.
   * - A goal that still holds money cannot be removed: move it to Spending first
   *   (`moveEnvelopeToSpending`), then remove it.
   * Spending is never removable, and neither is the goal Spending sweeps into.
   */
  async removeEnvelope(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    envelopeId: string;
  }): Promise<EnvelopeRemovalResult> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      const found = await client.query<{
        id: string;
        tier_category: "fixed" | "sinking";
        current_balance: string;
      }>(
        `SELECT id, tier_category, current_balance::text
         FROM envelopes
         WHERE id = $1 AND tenant_id = $2 AND tier_category IN ('fixed', 'sinking')
           AND archived_at IS NULL
         FOR UPDATE`,
        [input.envelopeId, input.tenantId],
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundError();

      const sweepTarget = await client.query(
        `SELECT 1 FROM envelopes WHERE tenant_id = $1 AND sweep_envelope_id = $2 LIMIT 1`,
        [input.tenantId, input.envelopeId],
      );
      if (sweepTarget.rows.length > 0) {
        throw new ConflictError("Spending sweeps into this goal, so it can't be removed.");
      }

      const balanceCents = toCents(row.current_balance);
      if (balanceCents > 0 && row.tier_category === "sinking") {
        throw new ConflictError("This goal still has money set aside. Move it to Spending first.");
      }

      await client.query(
        `UPDATE scheduled_schedules SET is_active = FALSE
         WHERE tenant_id = $1 AND envelope_id = $2 AND is_active = TRUE`,
        [input.tenantId, input.envelopeId],
      );

      const archived = balanceCents === 0;
      if (archived) {
        await client.query(
          `UPDATE envelopes SET archived_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [input.envelopeId, input.tenantId],
        );
      } else {
        // The waterfall tops a bill up to its cap when it has no schedule. Clear the cap so a
        // removed bill that still holds money is not funded again.
        await client.query(
          `UPDATE envelopes SET target_cap = NULL WHERE id = $1 AND tenant_id = $2`,
          [input.envelopeId, input.tenantId],
        );
      }

      await runEvaluationPipeline(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        trigger: "sync",
      });
      this.logInfo("Envelope removed", { id: input.envelopeId, archived });
      return { id: input.envelopeId, archived };
    });
  }

  /** Change a schedule's amount, next date, or repeat rule. Owner and admin only. */
  async updateSchedule(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    scheduleId: string;
    changes: UpdateScheduleBody;
  }): Promise<ScheduleMutationResult> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM scheduled_schedules
         WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
         FOR UPDATE`,
        [input.scheduleId, input.tenantId],
      );
      if (!existing.rows[0]) throw new NotFoundError();

      const { amountCents, nextDueDate, recurrenceRrule } = input.changes;
      await client.query(
        `UPDATE scheduled_schedules
         SET amount = COALESCE($3::numeric, amount),
             next_due_date = COALESCE($4::date, next_due_date),
             recurrence_rrule = COALESCE($5, recurrence_rrule)
         WHERE id = $1 AND tenant_id = $2`,
        [
          input.scheduleId,
          input.tenantId,
          amountCents === undefined ? null : fromCents(amountCents),
          nextDueDate ?? null,
          recurrenceRrule ?? null,
        ],
      );

      await runEvaluationPipeline(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        trigger: "sync",
      });
      this.logInfo("Schedule updated", { id: input.scheduleId });
      return { id: input.scheduleId };
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
            // D3: the schedule is the due amount. Keep it in step with what was accepted.
            await this.syncBillScheduleToPayload(client, input.tenantId, row.envelope_id, row.payload);
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

  /**
   * A bill with an active outflow schedule is funded from the schedule, not from its cap (D3).
   * When a suggestion is accepted, the schedule takes the accepted amount (and date, when one
   * was suggested) so the bill is not left funding the old number.
   */
  private async syncBillScheduleToPayload(
    client: PoolClient,
    tenantId: string,
    envelopeId: string,
    payload: EnvelopePayload,
  ): Promise<void> {
    if (payload.tierCategory !== "fixed") return;
    const amountCents = payload.amountEachPaydayCents ?? payload.targetCapCents;
    if (amountCents === null || amountCents === undefined || amountCents <= 0) return;
    await client.query(
      `UPDATE scheduled_schedules
       SET amount = $1::numeric,
           title = $2,
           next_due_date = COALESCE($3::date, next_due_date)
       WHERE tenant_id = $4 AND envelope_id = $5 AND direction = 'outflow' AND is_active = TRUE`,
      [fromCents(amountCents), payload.name, payload.dueDate ?? null, tenantId, envelopeId],
    );
  }

  /**
   * Move everything a goal (or a bill that is off payday) holds into Spending. Owner and
   * admin only. This is how leftover money is released before the envelope is removed.
   * It is a move between envelopes: no bank balance changes and no ledger row is written.
   */
  async moveEnvelopeToSpending(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    envelopeId: string;
  }): Promise<EnvelopeMoveResult> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      await lockTenantForUpdate(client, input.tenantId);
      const found = await client.query<{
        id: string;
        tier_category: "fixed" | "sinking";
        current_balance: string;
      }>(
        `SELECT id, tier_category, current_balance::text
         FROM envelopes
         WHERE id = $1 AND tenant_id = $2 AND tier_category IN ('fixed', 'sinking')
           AND archived_at IS NULL
         FOR UPDATE`,
        [input.envelopeId, input.tenantId],
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundError();

      const sweepTarget = await client.query(
        `SELECT 1 FROM envelopes WHERE tenant_id = $1 AND sweep_envelope_id = $2 LIMIT 1`,
        [input.tenantId, input.envelopeId],
      );
      if (sweepTarget.rows.length > 0) {
        throw new ConflictError("Spending sweeps into this goal, so its money stays put.");
      }
      if (row.tier_category === "fixed") {
        const live = await client.query(
          `SELECT 1 FROM scheduled_schedules
           WHERE tenant_id = $1 AND envelope_id = $2 AND is_active = TRUE LIMIT 1`,
          [input.tenantId, input.envelopeId],
        );
        if (live.rows.length > 0) {
          throw new ConflictError("Take this bill off payday before moving its money.");
        }
      }

      const movedCents = toCents(row.current_balance);
      if (movedCents <= 0) {
        throw new ConflictError("There is nothing set aside to move.");
      }
      const spending = await client.query<{ id: string }>(
        `SELECT id FROM envelopes
         WHERE tenant_id = $1 AND tier_category = 'discretionary' AND archived_at IS NULL
         FOR UPDATE`,
        [input.tenantId],
      );
      if (!spending.rows[0]) throw new ConflictError("No spending envelope");

      await client.query(
        `UPDATE envelopes SET current_balance = current_balance - $1
         WHERE id = $2 AND tenant_id = $3`,
        [fromCents(movedCents), input.envelopeId, input.tenantId],
      );
      await client.query(
        `UPDATE envelopes SET current_balance = current_balance + $1
         WHERE id = $2 AND tenant_id = $3`,
        [fromCents(movedCents), spending.rows[0].id, input.tenantId],
      );

      await runEvaluationPipeline(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        trigger: "sync",
      });
      this.logInfo("Envelope balance moved to Spending", {
        id: input.envelopeId,
        movedCents,
      });
      return { id: input.envelopeId, movedCents };
    });
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
