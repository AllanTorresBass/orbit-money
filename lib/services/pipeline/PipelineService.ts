import type { PoolClient } from "pg";
import { canConfigure, type MembershipRole } from "@/lib/auth/permissions";
import { withTransaction } from "@/lib/db/connection";
import { toCents } from "@/lib/money/numeric";
import { BaseService } from "@/lib/services/base/BaseService";
import type {
  CronBatchSummary,
  PipelineRunListItem,
  PipelineStepRow,
} from "@/types/pipeline/pipeline.types";

interface RunRow {
  id: string;
  trigger: "sync" | "midnight";
  as_of_date: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  forecast_stale: boolean;
  cuts_applied: number;
  o_unfunded: string | null;
  s_daily: string | null;
  s_today: string | null;
  n_p: number | null;
  sweep_incomplete: boolean;
  cron_batch_id: string | null;
  error_code: string | null;
  reason_code: string | null;
  error_message: string | null;
  cash_cents: string | null;
  triggered_by_user_id: string | null;
}

interface StepRowSql {
  id: string;
  run_id: string;
  step: string;
  started_at: Date;
  duration_ms: number | null;
  payload: Record<string, unknown>;
}

const RUN_COLUMNS = `id, trigger, as_of_date::text, started_at, finished_at, status,
  forecast_stale, cuts_applied, o_unfunded::text, s_daily::text, s_today::text,
  n_p, sweep_incomplete, cron_batch_id, error_code, reason_code, error_message, cash_cents::text,
  triggered_by_user_id`;

function mapRun(row: RunRow): PipelineRunListItem {
  return {
    id: row.id,
    trigger: row.trigger,
    asOfDate: row.as_of_date,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    status: row.status,
    forecastStale: row.forecast_stale,
    cutsApplied: row.cuts_applied,
    oUnfundedCents: row.o_unfunded === null ? null : toCents(row.o_unfunded),
    sDailyCents: row.s_daily === null ? null : toCents(row.s_daily),
    sTodayCents: row.s_today === null ? null : toCents(row.s_today),
    nP: row.n_p,
    sweepIncomplete: row.sweep_incomplete,
    cronBatchId: row.cron_batch_id,
    errorCode: row.error_code,
    reasonCode: row.reason_code,
    errorMessage: row.error_message,
    // BIGINT arrives as a string; cents stay well inside Number's exact range.
    cashCents: row.cash_cents === null ? null : Number(row.cash_cents),
    triggeredByUserId: row.triggered_by_user_id,
  };
}

async function loadSteps(
  client: PoolClient,
  tenantId: string,
  runIds: string[],
): Promise<Map<string, PipelineStepRow[]>> {
  const byRun = new Map<string, PipelineStepRow[]>();
  if (runIds.length === 0) return byRun;
  const result = await client.query<StepRowSql>(
    `SELECT id, run_id, step, started_at, duration_ms, payload
     FROM pipeline_steps
     WHERE tenant_id = $1 AND run_id = ANY($2::uuid[])
     ORDER BY started_at ASC, id ASC`,
    [tenantId, runIds],
  );
  for (const row of result.rows) {
    const list = byRun.get(row.run_id) ?? [];
    list.push({
      id: row.id,
      step: row.step,
      startedAt: row.started_at.toISOString(),
      durationMs: row.duration_ms,
      payload: row.payload ?? {},
    });
    byRun.set(row.run_id, list);
  }
  return byRun;
}

export class PipelineService extends BaseService {
  constructor() {
    super("PipelineService");
  }

  async listRuns(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    asOfDate?: string;
    limit?: number;
    includeSteps?: boolean;
  }): Promise<{ runs: PipelineRunListItem[]; latestBatch: CronBatchSummary | null }> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const batchResult = await client.query<{
        id: string;
        started_at: Date;
        finished_at: Date | null;
        due_count: number;
        ok_count: number;
        error_count: number;
        skipped_count: number;
      }>(
        // The newest tick that ran a midnight evaluation for THIS tenant. The newest batch
        // overall may not have touched it, and its counts would say nothing about this household.
        `SELECT b.id, b.started_at, b.finished_at, b.due_count, b.ok_count, b.error_count,
                b.skipped_count
         FROM cron_batches b
         WHERE EXISTS (
           SELECT 1 FROM pipeline_runs r
           WHERE r.cron_batch_id = b.id AND r.tenant_id = $1 AND r.trigger = 'midnight'
         )
         ORDER BY b.started_at DESC
         LIMIT 1`,
        [input.tenantId],
      );
      const batchRow = batchResult.rows[0];
      const latestBatch: CronBatchSummary | null = batchRow
        ? {
            id: batchRow.id,
            startedAt: batchRow.started_at.toISOString(),
            finishedAt: batchRow.finished_at ? batchRow.finished_at.toISOString() : null,
            dueCount: batchRow.due_count,
            okCount: batchRow.ok_count,
            errorCount: batchRow.error_count,
            skippedCount: batchRow.skipped_count,
          }
        : null;
      await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

      const result = await client.query<RunRow>(
        input.asOfDate
          ? `SELECT ${RUN_COLUMNS}
             FROM pipeline_runs
             WHERE tenant_id = $1 AND as_of_date = $2::date
             ORDER BY started_at DESC
             LIMIT $3`
          : `SELECT ${RUN_COLUMNS}
             FROM pipeline_runs
             WHERE tenant_id = $1
             ORDER BY started_at DESC
             LIMIT $2`,
        input.asOfDate ? [input.tenantId, input.asOfDate, limit] : [input.tenantId, limit],
      );

      let runs = result.rows.map(mapRun);
      if (input.includeSteps) {
        const steps = await loadSteps(
          client,
          input.tenantId,
          runs.map((r) => r.id),
        );
        runs = runs.map((run) => ({ ...run, steps: steps.get(run.id) ?? [] }));
      }
      return { runs, latestBatch };
    });
  }

  /** One run with its steps. Null when the id is unknown for this tenant. */
  async getRun(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    runId: string;
  }): Promise<PipelineRunListItem | null> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      const result = await client.query<RunRow>(
        `SELECT ${RUN_COLUMNS}
         FROM pipeline_runs
         WHERE tenant_id = $1 AND id = $2`,
        [input.tenantId, input.runId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const steps = await loadSteps(client, input.tenantId, [row.id]);
      return { ...mapRun(row), steps: steps.get(row.id) ?? [] };
    });
  }
}

export const pipelineService = new PipelineService();
