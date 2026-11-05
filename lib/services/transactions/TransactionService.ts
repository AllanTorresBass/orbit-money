import { randomUUID } from "node:crypto";
import { canSpend } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db/connection";
import { bookedDate } from "@/lib/calendar/dates";
import { fromCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { BaseService } from "@/lib/services/base/BaseService";
import type { MembershipRole } from "@/lib/auth/session";

export class TransactionService extends BaseService {
  constructor() {
    super("TransactionService");
  }

  async createPurchase(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    amountCents: number;
    idempotencyKey?: string;
    memo?: string;
  }): Promise<{ id: string; sTodayCents: number | null }> {
    if (!canSpend(input.role)) {
      throw new Error("Forbidden");
    }
    if (input.amountCents <= 0) {
      throw new Error("Amount must be positive");
    }

    const key = input.idempotencyKey ?? randomUUID();

    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM transactions WHERE tenant_id = $1 AND idempotency_key = $2`,
        [input.tenantId, key],
      );
      if (existing.rows[0]) {
        const allowance = await client.query<{ s_today: string }>(
          `SELECT s_today::text FROM allowance_snapshots WHERE tenant_id = $1`,
          [input.tenantId],
        );
        return {
          id: existing.rows[0].id,
          sTodayCents: allowance.rows[0]
            ? Math.round(Number(allowance.rows[0].s_today) * 100)
            : null,
        };
      }

      const tenant = await client.query<{ timezone: string }>(
        `SELECT timezone FROM tenants WHERE id = $1`,
        [input.tenantId],
      );
      const timezone = tenant.rows[0]?.timezone ?? "UTC";
      const now = new Date();
      const localDate = bookedDate(now, timezone);

      const account = await client.query<{ id: string }>(
        `SELECT id FROM accounts WHERE tenant_id = $1 ORDER BY is_everyday DESC LIMIT 1`,
        [input.tenantId],
      );
      const accountId = account.rows[0]?.id;
      if (!accountId) throw new Error("No account");

      const spending = await client.query<{ id: string }>(
        `SELECT id FROM envelopes
         WHERE tenant_id = $1 AND tier_category = 'discretionary' LIMIT 1`,
        [input.tenantId],
      );
      const envelopeId = spending.rows[0]?.id;
      if (!envelopeId) throw new Error("No spending envelope");

      const amount = -input.amountCents;
      const insert = await client.query<{ id: string }>(
        `INSERT INTO transactions
           (tenant_id, account_id, envelope_id, amount, booked_at, booked_date, memo, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)
         RETURNING id`,
        [
          input.tenantId,
          accountId,
          envelopeId,
          fromCents(amount),
          now.toISOString(),
          localDate,
          input.memo ?? "Purchase",
          key,
        ],
      );

      await client.query(
        `UPDATE accounts
         SET current_balance = current_balance + $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [fromCents(amount), accountId, input.tenantId],
      );

      const pipeline = await runEvaluationPipeline(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        trigger: "sync",
        transactionId: insert.rows[0].id,
        asOfDate: localDate,
      });

      this.logInfo("Purchase recorded", {
        tenantId: input.tenantId,
        amountCents: input.amountCents,
      });

      return { id: insert.rows[0].id, sTodayCents: pipeline.sTodayCents };
    });
  }
}

export const transactionService = new TransactionService();
