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

  it(
    "pending mid-state resume applies only missing moves (no double-sweep)",
    async () => {
      const cycleEnd = "2026-11-17";
      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        await client.query(`DELETE FROM cycle_sweeps WHERE tenant_id = $1`, [HARBOR.tenantId]);
        // Ensure moves column exists (007) for this environment.
        await client.query(
          `ALTER TABLE cycle_sweeps
           ADD COLUMN IF NOT EXISTS moves JSONB NOT NULL DEFAULT '[]'::jsonb`,
        );
        await client.query(`UPDATE envelopes SET current_balance = 500.00 WHERE id = $1`, [
          HARBOR.spendingId,
        ]);
        await client.query(`UPDATE envelopes SET current_balance = 600.00 WHERE id = $1`, [
          HARBOR.carId,
        ]);
        await client.query(`UPDATE envelopes SET current_balance = 100.00 WHERE id = $1`, [
          HARBOR.emergencyId,
        ]);

        // Simulate a crash after Car was topped up ($400) but before Spending
        // was reduced and before status flipped to applied.
        const moves = {
          items: [
            { envelopeId: HARBOR.carId, amountCents: 40_000, applied: true },
            { envelopeId: HARBOR.emergencyId, amountCents: 10_000, applied: false },
          ],
          discApplied: false,
          leftoverCents: 0,
        };
        await client.query(
          `INSERT INTO cycle_sweeps
             (tenant_id, cycle_end_date, amount, destination_envelope_id, incomplete, status, moves)
           VALUES ($1, $2::date, 500.00, $3, FALSE, 'pending', $4::jsonb)`,
          [HARBOR.tenantId, cycleEnd, HARBOR.carId, JSON.stringify(moves)],
        );
        await client.query(`UPDATE envelopes SET current_balance = 1000.00 WHERE id = $1`, [
          HARBOR.carId,
        ]);

        await client.query(
          `UPDATE scheduled_schedules SET next_due_date = '2026-11-18' WHERE id = $1`,
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
          asOfDate: cycleEnd,
        });
      });

      const after = await withTransaction(
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
          const emergency = await client.query<{ current_balance: string }>(
            `SELECT current_balance::text FROM envelopes WHERE id = $1`,
            [HARBOR.emergencyId],
          );
          const sweep = await client.query<{ status: string; amount: string }>(
            `SELECT status, amount::text FROM cycle_sweeps
             WHERE tenant_id = $1 AND cycle_end_date = $2::date`,
            [HARBOR.tenantId, cycleEnd],
          );
          return {
            spendingCents: toCents(spend.rows[0]?.current_balance ?? "0"),
            carCents: toCents(car.rows[0]?.current_balance ?? "0"),
            emergencyCents: toCents(emergency.rows[0]?.current_balance ?? "0"),
            status: sweep.rows[0]?.status,
            sweptCents: toCents(sweep.rows[0]?.amount ?? "0"),
          };
        },
      );

      // Car already had the $400 move — must not receive another $400.
      expect(after.carCents).toBe(100_000);
      // Emergency receives only the remaining $100 move.
      expect(after.emergencyCents).toBe(20_000);
      expect(after.spendingCents).toBe(0);
      expect(after.status).toBe("applied");
      expect(after.sweptCents).toBe(50_000);
    },
    30_000,
  );
});
