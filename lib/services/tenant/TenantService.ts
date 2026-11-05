import { randomUUID } from "node:crypto";
import { firstOccurrenceOnOrAfter } from "@/lib/calendar/next-occurrence";
import { withTransaction } from "@/lib/db/connection";
import { fromCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { BaseService } from "@/lib/services/base/BaseService";
import type { CreateTenantInput, CreateTenantResult } from "@/types/tenant/tenant.types";

export class TenantService extends BaseService {
  constructor() {
    super("TenantService");
  }

  async createHousehold(input: CreateTenantInput): Promise<CreateTenantResult> {
    // Opening deposit always books on the typed nextPayday. Schedule dues use
    // firstOccurrenceOnOrAfter so semi-monthly rules that miss that date still
    // land on their next legal day for subsequent cycles.
    const openingDepositDate = input.nextPayday;
    const schedules = input.rrules.map((rrule) => ({
      rrule,
      nextDueDate: firstOccurrenceOnOrAfter(rrule, input.nextPayday),
    }));

    return withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");

      const tenantId = randomUUID();
      const userId = randomUUID();
      const accountId = randomUUID();
      const spendingId = randomUUID();
      const emergencyId = randomUUID();

      await client.query(
        `INSERT INTO tenants (id, name, tenant_type, timezone, holiday_region, liquidity_floor)
         VALUES ($1, $2, $3, $4, 'US', 0.00)`,
        [tenantId, input.name, input.tenantType, input.timezone],
      );

      await client.query(
        `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [userId, input.ownerEmail.toLowerCase(), input.ownerName],
      );

      const userRow = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`,
        [input.ownerEmail.toLowerCase()],
      );
      const resolvedUserId = userRow.rows[0]?.id ?? userId;

      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`,
        [tenantId, resolvedUserId],
      );

      await client.query(
        `INSERT INTO accounts (id, tenant_id, name, current_balance, is_everyday)
         VALUES ($1, $2, 'Checking', 0.00, TRUE)`,
        [accountId, tenantId],
      );

      await client.query(
        `INSERT INTO envelopes
           (id, tenant_id, name, tier_category, priority_order, current_balance, rollover_policy, monthly_installment)
         VALUES
           ($1, $3, 'Emergency', 'sinking', 1, 0.00, 'accumulate', 0.00),
           ($2, $3, 'Spending', 'discretionary', 1, 0.00, 'reset_sweep', NULL)`,
        [emergencyId, spendingId, tenantId],
      );

      await client.query(
        `UPDATE envelopes SET sweep_envelope_id = $1 WHERE id = $2`,
        [emergencyId, spendingId],
      );

      for (const schedule of schedules) {
        await client.query(
          `INSERT INTO scheduled_schedules
             (tenant_id, account_id, title, amount, direction, recurrence_rrule, next_due_date, is_active)
           VALUES ($1, $2, 'Payday', $3, 'inflow', $4, $5::date, TRUE)`,
          [
            tenantId,
            accountId,
            fromCents(input.paydayAmountCents),
            schedule.rrule,
            schedule.nextDueDate,
          ],
        );
      }

      // Opening payday deposit so Today has a number immediately.
      const txn = await client.query<{ id: string }>(
        `INSERT INTO transactions
           (tenant_id, account_id, amount, booked_at, booked_date, memo, idempotency_key)
         VALUES ($1, $2, $3, NOW(), $4::date, 'Payday', $5)
         RETURNING id`,
        [
          tenantId,
          accountId,
          fromCents(input.paydayAmountCents),
          openingDepositDate,
          `create-payday-${tenantId}`,
        ],
      );

      await client.query(
        `UPDATE accounts SET current_balance = current_balance + $1, updated_at = NOW()
         WHERE id = $2`,
        [fromCents(input.paydayAmountCents), accountId],
      );

      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [resolvedUserId]);
      await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

      await runEvaluationPipeline(client, {
        tenantId,
        userId: resolvedUserId,
        trigger: "sync",
        transactionId: txn.rows[0].id,
        asOfDate: openingDepositDate,
      });

      this.logInfo("Household created", { tenantId });
      return { tenantId, userId: resolvedUserId };
    });
  }

  async updateFloor(tenantId: string, userId: string, role: string, floorCents: number) {
    if (role !== "owner" && role !== "admin") {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId, userId }, async (client) => {
      await client.query(
        `UPDATE tenants SET liquidity_floor = $1 WHERE id = $2`,
        [fromCents(floorCents), tenantId],
      );
      await runEvaluationPipeline(client, {
        tenantId,
        userId,
        trigger: "sync",
      });
      return { floorCents };
    });
  }
}

export const tenantService = new TenantService();
