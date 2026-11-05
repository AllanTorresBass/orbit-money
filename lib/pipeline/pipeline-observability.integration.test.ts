import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { closeAbandonedPipelineRuns, prunePipelineRuns } from "@/lib/pipeline/telemetry";

config({ path: ".env" });

class Rollback extends Error {}

describe("pipeline observability", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it(
    "a thrown pipeline error commits an `error` run even though the transaction rolls back",
    async () => {
      const runId = randomUUID();
      await expect(
        withTransaction(null, async (client) => {
          await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
          // A debit with no envelope cannot settle, so the run throws inside step 1.
          const insert = await client.query<{ id: string }>(
            `INSERT INTO transactions
               (tenant_id, account_id, envelope_id, amount, booked_at, booked_date, memo, idempotency_key)
             VALUES ($1, $2, NULL, -5.00, NOW(), '2026-11-04', 'Broken', $3)
             RETURNING id`,
            [HARBOR.tenantId, HARBOR.accountId, `obs-error-${runId}`],
          );
          await runEvaluationPipeline(client, {
            tenantId: HARBOR.tenantId,
            userId: HARBOR.alexId,
            trigger: "sync",
            transactionId: insert.rows[0].id,
            asOfDate: "2026-11-04",
            runId,
          });
        }),
      ).rejects.toThrow("Debit requires an envelope");

      const row = await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        const result = await client.query<{ status: string; error_code: string | null }>(
          `SELECT status, error_code FROM pipeline_runs WHERE id = $1`,
          [runId],
        );
        return result.rows[0];
      });
      expect(row?.status).toBe("error");
      expect(row?.error_code).toBe("debit_without_envelope");

      await getPool().query(`DELETE FROM pipeline_runs WHERE id = $1`, [runId]);
    },
    60_000,
  );

  it(
    "retention deletes runs older than 90 days with their steps, and closes abandoned runs",
    async () => {
      const oldRun = randomUUID();
      const stuckRun = randomUUID();
      const freshRun = randomUUID();
      let result: { pruned: number; closed: number; stepsLeft: number; fresh: boolean } | null =
        null;
      try {
        await withTransaction(null, async (client) => {
          await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
          await client.query(
            `INSERT INTO pipeline_runs (id, tenant_id, trigger, as_of_date, started_at, status)
             VALUES ($1, $4, 'midnight', '2026-01-01', NOW() - INTERVAL '100 days', 'ok'),
                    ($2, $4, 'midnight', '2026-11-04', NOW() - INTERVAL '3 hours', 'running'),
                    ($3, $4, 'midnight', '2026-11-04', NOW(), 'ok')`,
            [oldRun, stuckRun, freshRun, HARBOR.tenantId],
          );
          await client.query(
            `INSERT INTO pipeline_steps (run_id, tenant_id, step) VALUES ($1, $2, 'settle')`,
            [oldRun, HARBOR.tenantId],
          );
          const pruned = await prunePipelineRuns(client, 90);
          const closed = await closeAbandonedPipelineRuns(client, 60);
          const steps = await client.query(`SELECT 1 FROM pipeline_steps WHERE run_id = $1`, [
            oldRun,
          ]);
          const fresh = await client.query(`SELECT 1 FROM pipeline_runs WHERE id = $1`, [
            freshRun,
          ]);
          result = {
            pruned,
            closed,
            stepsLeft: steps.rowCount ?? 0,
            fresh: (fresh.rowCount ?? 0) === 1,
          };
          throw new Rollback("done");
        });
      } catch (error: unknown) {
        if (!(error instanceof Rollback)) throw error;
      }

      expect(result).not.toBeNull();
      expect(result!.pruned).toBeGreaterThanOrEqual(1);
      expect(result!.closed).toBeGreaterThanOrEqual(1);
      expect(result!.stepsLeft).toBe(0);
      expect(result!.fresh).toBe(true);
    },
    60_000,
  );
});
