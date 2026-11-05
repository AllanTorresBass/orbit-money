import { config } from "dotenv";
import type { PoolClient } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { toCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import type { PipelineRunSummary } from "@/types/pipeline/pipeline.types";

config({ path: ".env" });

interface ShortfallResult {
  pipeline: PipelineRunSummary;
  breachDays: number;
  firstBreachDay: number | null;
  snapshot: { mitigated: boolean; sDailyCents: number };
  stepNames: string[];
  runStatus: string;
}

/** Thrown to roll the scenario back so Harbor keeps its seeded state. */
class ScenarioDone extends Error {
  constructor(readonly result: ShortfallResult) {
    super("scenario done");
  }
}

async function resetHarborPostPaycheck(client: PoolClient, input: {
  cashCents: number;
  floorDollars: string;
}): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
  await client.query(`UPDATE tenants SET liquidity_floor = $1 WHERE id = $2`, [
    input.floorDollars,
    HARBOR.tenantId,
  ]);
  await client.query(
    `UPDATE accounts SET current_balance = $1, updated_at = NOW() WHERE id = $2`,
    [(input.cashCents / 100).toFixed(2), HARBOR.accountId],
  );
  const balances: Array<[string, string]> = [
    [HARBOR.rentId, "1200.00"],
    [HARBOR.electricId, "150.00"],
    [HARBOR.carId, "600.00"],
    [HARBOR.vacationId, "1000.00"],
    [HARBOR.emergencyId, "0.00"],
    [HARBOR.spendingId, "1570.00"],
  ];
  for (const [id, balance] of balances) {
    await client.query(`UPDATE envelopes SET current_balance = $1 WHERE id = $2`, [balance, id]);
  }
  await client.query(`DELETE FROM transactions WHERE tenant_id = $1 AND settled_at IS NULL`, [
    HARBOR.tenantId,
  ]);
  await client.query(`UPDATE scheduled_schedules SET next_due_date = '2026-11-18' WHERE id = $1`, [
    HARBOR.paydayScheduleId,
  ]);
  await client.query(`UPDATE scheduled_schedules SET next_due_date = '2026-11-13' WHERE id = $1`, [
    HARBOR.rentScheduleId,
  ]);
}

async function runShortfall(input: {
  cashCents: number;
  floorDollars: string;
}): Promise<ShortfallResult> {
  try {
    await withTransaction(null, async (client) => {
      await resetHarborPostPaycheck(client, input);
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
        HARBOR.tenantId,
      ]);
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [HARBOR.alexId]);
      await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

      const pipeline = await runEvaluationPipeline(client, {
        tenantId: HARBOR.tenantId,
        userId: HARBOR.alexId,
        trigger: "sync",
        asOfDate: "2026-11-04",
      });

      const days = await client.query<{ day_offset: number; status: string }>(
        `SELECT day_offset, status FROM forecast_days
         WHERE tenant_id = $1 ORDER BY day_offset`,
        [HARBOR.tenantId],
      );
      const breaches = days.rows.filter((d) => d.status === "breach");
      const snap = await client.query<{ mitigated: boolean; s_daily: string }>(
        `SELECT mitigated, s_daily::text FROM allowance_snapshots WHERE tenant_id = $1`,
        [HARBOR.tenantId],
      );
      const steps = await client.query<{ step: string }>(
        `SELECT step FROM pipeline_steps WHERE run_id = $1 ORDER BY started_at, id`,
        [pipeline.runId],
      );
      const run = await client.query<{ status: string }>(
        `SELECT status FROM pipeline_runs WHERE id = $1`,
        [pipeline.runId],
      );

      throw new ScenarioDone({
        pipeline,
        breachDays: breaches.length,
        firstBreachDay: breaches[0]?.day_offset ?? null,
        snapshot: {
          mitigated: snap.rows[0]?.mitigated ?? false,
          sDailyCents: toCents(snap.rows[0]?.s_daily ?? "0"),
        },
        stepNames: steps.rows.map((r) => r.step),
        runStatus: run.rows[0]?.status ?? "missing",
      });
    });
  } catch (error: unknown) {
    if (error instanceof ScenarioDone) return error.result;
    throw error;
  }
  throw new Error("Scenario did not complete");
}

/** Harbor walkthrough E — a shortfall on the timeline (docs/09), through the full pipeline. */
describe("Harbor shortfall E", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it(
    "a small gap cuts the Spending pace once and clears the breach",
    async () => {
      // Day 13 sits at 2,342.18 at the paycheck pace; a 2,400 floor leaves a ~57 gap.
      const result = await runShortfall({ cashCents: 500_000, floorDollars: "2400.00" });

      expect(result.pipeline.cutsApplied).toBeGreaterThan(0);
      expect(result.pipeline.mitigated).toBe(true);
      expect(result.pipeline.sDailyCents).toBeLessThan(11_214);
      expect(result.snapshot.mitigated).toBe(true);
      expect(result.snapshot.sDailyCents).toBe(result.pipeline.sDailyCents);
      expect(result.stepNames).toContain("floor_check");
      expect(result.stepNames).toContain("cut");
      expect(result.runStatus).toBe("ok");
    },
    60_000,
  );

  it(
    "a gap no cut can close leaves breach days, a zero pace, and a cut step",
    async () => {
      // 1,000 in the bank cannot cover the 1,200 rent debit on day 9.
      const result = await runShortfall({ cashCents: 100_000, floorDollars: "200.00" });

      expect(result.pipeline.cutsApplied).toBeGreaterThan(0);
      expect(result.breachDays).toBeGreaterThan(0);
      expect(result.firstBreachDay).not.toBeNull();
      expect(result.snapshot.mitigated).toBe(true);
      expect(result.stepNames).toContain("cut");
      expect(result.stepNames[result.stepNames.length - 1]).toBe("publish");
    },
    60_000,
  );
});
