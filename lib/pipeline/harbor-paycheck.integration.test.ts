import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { toCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";

config({ path: ".env" });

/**
 * Harbor walkthrough A — paycheck from pre-deposit balances (docs/09).
 */
describe("Harbor paycheck A", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it(
    "settles $3000 and publishes S_today 112.18 with forecast days 9/13",
    async () => {
      const result = await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");

        // Pre-paycheck balances from docs/09 starting position.
        await client.query(
          `UPDATE accounts SET current_balance = 2000.00, updated_at = NOW() WHERE id = $1`,
          [HARBOR.accountId],
        );
        await client.query(`UPDATE envelopes SET current_balance = 0 WHERE id = $1`, [
          HARBOR.rentId,
        ]);
        await client.query(`UPDATE envelopes SET current_balance = 40.00 WHERE id = $1`, [
          HARBOR.electricId,
        ]);
        await client.query(`UPDATE envelopes SET current_balance = 400.00 WHERE id = $1`, [
          HARBOR.carId,
        ]);
        await client.query(`UPDATE envelopes SET current_balance = 1000.00 WHERE id = $1`, [
          HARBOR.vacationId,
        ]);
        await client.query(`UPDATE envelopes SET current_balance = 80.00 WHERE id = $1`, [
          HARBOR.spendingId,
        ]);
        // Allocations reference transactions, so they go first.
        await client.query(
          `DELETE FROM allocations WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        await client.query(
          `DELETE FROM transactions WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        await client.query(
          `UPDATE scheduled_schedules SET next_due_date = '2026-11-18'
           WHERE id = $1`,
          [HARBOR.paydayScheduleId],
        );
        await client.query(
          `UPDATE scheduled_schedules SET next_due_date = '2026-11-13'
           WHERE id = $1`,
          [HARBOR.rentScheduleId],
        );

        const insert = await client.query<{ id: string }>(
          `INSERT INTO transactions
             (tenant_id, account_id, envelope_id, amount, booked_at, booked_date, memo, idempotency_key)
           VALUES ($1, $2, NULL, 3000.00, '2026-11-04T12:00:00Z', '2026-11-04', 'Paycheck', $3)
           RETURNING id`,
          [HARBOR.tenantId, HARBOR.accountId, `harbor-a-paycheck-${Date.now()}`],
        );

        await client.query(
          `UPDATE accounts SET current_balance = current_balance + 3000.00, updated_at = NOW()
           WHERE id = $1`,
          [HARBOR.accountId],
        );

        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          HARBOR.tenantId,
        ]);
        await client.query("SELECT set_config('app.current_user_id', $1, true)", [HARBOR.alexId]);
        await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

        const pipeline = await runEvaluationPipeline(client, {
          tenantId: HARBOR.tenantId,
          userId: HARBOR.alexId,
          trigger: "sync",
          transactionId: insert.rows[0].id,
          asOfDate: "2026-11-04",
        });

        const envelopes = await client.query<{ id: string; current_balance: string }>(
          `SELECT id, current_balance::text FROM envelopes WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        const byId = Object.fromEntries(
          envelopes.rows.map((r) => [r.id, toCents(r.current_balance)]),
        );
        const day9 = await client.query<{ balance: string }>(
          `SELECT balance::text FROM forecast_days WHERE tenant_id = $1 AND day_offset = 9`,
          [HARBOR.tenantId],
        );
        const day13 = await client.query<{ balance: string }>(
          `SELECT balance::text FROM forecast_days WHERE tenant_id = $1 AND day_offset = 13`,
          [HARBOR.tenantId],
        );

        return {
          pipeline,
          rent: byId[HARBOR.rentId],
          electric: byId[HARBOR.electricId],
          car: byId[HARBOR.carId],
          vacation: byId[HARBOR.vacationId],
          spending: byId[HARBOR.spendingId],
          day9: toCents(day9.rows[0]?.balance ?? "0"),
          day13: toCents(day13.rows[0]?.balance ?? "0"),
        };
      });

      expect(result.rent).toBe(120_000);
      expect(result.electric).toBe(15_000);
      expect(result.car).toBe(60_000);
      expect(result.vacation).toBe(100_000);
      expect(result.spending).toBe(157_000);
      expect(result.pipeline.sTodayCents).toBe(11_218);
      expect(result.pipeline.sDailyCents).toBe(11_214);
      expect(result.pipeline.nP).toBe(14);
      expect(result.day9).toBe(279_074);
      expect(result.day13).toBe(234_218);
    },
    60_000,
  );
});
