import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { toCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";

config({ path: ".env" });

describe("Harbor cycle sweep", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it(
    "on cycle-end midnight moves Spending into Car up to the cap and is idempotent",
    async () => {
      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        await client.query(`DELETE FROM cycle_sweeps WHERE tenant_id = $1`, [HARBOR.tenantId]);
        await client.query(`UPDATE envelopes SET current_balance = 1530.00 WHERE id = $1`, [
          HARBOR.spendingId,
        ]);
        await client.query(`UPDATE envelopes SET current_balance = 600.00 WHERE id = $1`, [
          HARBOR.carId,
        ]);
        // Ensure next payday is tomorrow relative to cycle-end day.
        await client.query(
          `UPDATE scheduled_schedules SET next_due_date = '2026-11-18'
           WHERE id = $1`,
          [HARBOR.paydayScheduleId],
        );
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          HARBOR.tenantId,
        ]);
        await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

        await runEvaluationPipeline(client, {
          tenantId: HARBOR.tenantId,
          userId: HARBOR.blairId,
          trigger: "midnight",
          asOfDate: "2026-11-17",
        });
      });

      const first = await withTransaction(
        { tenantId: HARBOR.tenantId, userId: HARBOR.blairId },
        async (client) => {
          const spend = await client.query<{ current_balance: string }>(
            `SELECT current_balance::text FROM envelopes WHERE id = $1`,
            [HARBOR.spendingId],
          );
          const car = await client.query<{ current_balance: string }>(
            `SELECT current_balance::text FROM envelopes WHERE id = $1`,
            [HARBOR.carId],
          );
          const sweep = await client.query<{ amount: string }>(
            `SELECT amount::text FROM cycle_sweeps
             WHERE tenant_id = $1 AND cycle_end_date = '2026-11-17'`,
            [HARBOR.tenantId],
          );
          return {
            spendingCents: toCents(spend.rows[0]?.current_balance ?? "0"),
            carCents: toCents(car.rows[0]?.current_balance ?? "0"),
            sweptCents: toCents(sweep.rows[0]?.amount ?? "0"),
          };
        },
      );

      // Car room = 400; remainder of 1530 cascades to other sinks (Emergency uncapped).
      expect(first.carCents).toBe(100_000);
      expect(first.sweptCents).toBeGreaterThanOrEqual(40_000);
      expect(first.spendingCents).toBe(0);

      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          HARBOR.tenantId,
        ]);
        await runEvaluationPipeline(client, {
          tenantId: HARBOR.tenantId,
          userId: HARBOR.blairId,
          trigger: "midnight",
          asOfDate: "2026-11-17",
        });
      });

      const second = await withTransaction(
        { tenantId: HARBOR.tenantId, userId: HARBOR.blairId },
        async (client) => {
          const car = await client.query<{ current_balance: string }>(
            `SELECT current_balance::text FROM envelopes WHERE id = $1`,
            [HARBOR.carId],
          );
          const sweeps = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM cycle_sweeps
             WHERE tenant_id = $1 AND cycle_end_date = '2026-11-17'`,
            [HARBOR.tenantId],
          );
          return {
            carCents: toCents(car.rows[0]?.current_balance ?? "0"),
            sweepRows: Number(sweeps.rows[0]?.count ?? "0"),
          };
        },
      );

      expect(second.carCents).toBe(100_000);
      expect(second.sweepRows).toBe(1);
    },
    30_000,
  );
});
