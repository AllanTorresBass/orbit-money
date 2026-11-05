import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/connection";
import { logger } from "@/lib/logger";
import { fromCents } from "@/lib/money/numeric";
import type { PipelineStep, PipelineStepEvent } from "@/types/pipeline/pipeline.types";

/** Emit one structured pipeline step event (no PII / payee data). */
export function emitPipelineStep(
  event: Omit<PipelineStepEvent, "kind"> & { durationMs?: number },
): void {
  logger.info("pipeline_step", {
    kind: "pipeline_step",
    ...event,
  });
}

export interface PipelineRunContext {
  runId: string;
  tenantId: string;
  trigger: "sync" | "midnight";
  asOfDate: string;
  cronBatchId?: string;
}

/** Persist a step row and mirror to logs. */
export async function recordPipelineStep(
  client: PoolClient,
  ctx: PipelineRunContext,
  step: PipelineStep,
  payload: Omit<
    PipelineStepEvent,
    "kind" | "runId" | "trigger" | "tenantId" | "asOfDate" | "step" | "cronBatchId"
  > & { durationMs?: number },
): Promise<void> {
  const event: Omit<PipelineStepEvent, "kind"> = {
    runId: ctx.runId,
    trigger: ctx.trigger,
    tenantId: ctx.tenantId,
    asOfDate: ctx.asOfDate,
    step,
    cronBatchId: ctx.cronBatchId,
    ...payload,
  };
  emitPipelineStep(event);

  await client.query(
    // clock_timestamp(), not NOW(): steps share one transaction and must stay ordered.
    `INSERT INTO pipeline_steps (run_id, tenant_id, step, started_at, duration_ms, payload)
     VALUES ($1, $2, $3, clock_timestamp(), $4, $5::jsonb)`,
    [
      ctx.runId,
      ctx.tenantId,
      step,
      payload.durationMs ?? null,
      JSON.stringify({
        centsIn: payload.centsIn,
        centsOut: payload.centsOut,
        nP: payload.nP,
        sDailyCents: payload.sDailyCents,
        sTodayCents: payload.sTodayCents,
        oUnfundedCents: payload.oUnfundedCents,
        breachDate: payload.breachDate,
        gapCents: payload.gapCents,
        cutsApplied: payload.cutsApplied,
        idempotencyHit: payload.idempotencyHit,
        sweepIncomplete: payload.sweepIncomplete,
        forecastStale: payload.forecastStale,
        sweptCents: payload.sweptCents,
        advancedOutflows: payload.advancedOutflows,
        advancedInflows: payload.advancedInflows,
      }),
    ],
  );
}

export async function startPipelineRun(
  client: PoolClient,
  input: {
    runId: string;
    tenantId: string;
    trigger: "sync" | "midnight";
    asOfDate: string;
    transactionId?: string;
    cronBatchId?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO pipeline_runs
       (id, tenant_id, trigger, as_of_date, transaction_id, cron_batch_id, status)
     VALUES ($1, $2, $3, $4::date, $5, $6, 'running')`,
    [
      input.runId,
      input.tenantId,
      input.trigger,
      input.asOfDate,
      input.transactionId ?? null,
      input.cronBatchId ?? null,
    ],
  );
}

export async function finishPipelineRun(
  client: PoolClient,
  input: {
    runId: string;
    status: "ok" | "stale" | "error";
    forecastStale: boolean;
    cutsApplied: number;
    oUnfundedCents: number | null;
    sDailyCents: number | null;
    sTodayCents: number | null;
    nP: number | null;
    sweepIncomplete: boolean;
    errorCode?: string;
  },
): Promise<void> {
  await client.query(
    `UPDATE pipeline_runs SET
       finished_at = NOW(),
       status = $2,
       forecast_stale = $3,
       cuts_applied = $4,
       o_unfunded = $5,
       s_daily = $6,
       s_today = $7,
       n_p = $8,
       sweep_incomplete = $9,
       error_code = $10
     WHERE id = $1`,
    [
      input.runId,
      input.status,
      input.forecastStale,
      input.cutsApplied,
      input.oUnfundedCents !== null ? fromCents(input.oUnfundedCents) : null,
      input.sDailyCents !== null ? fromCents(input.sDailyCents) : null,
      input.sTodayCents !== null ? fromCents(input.sTodayCents) : null,
      input.nP,
      input.sweepIncomplete,
      input.errorCode ?? null,
    ],
  );
}

/** Short, PII-free code for `pipeline_runs.error_code` (VARCHAR(64)). */
export function classifyPipelineError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
      return `pg_${code}`;
    }
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("discretionary")) return "missing_discretionary";
    if (message.includes("tenant not found")) return "tenant_not_found";
    if (message.includes("debit requires")) return "debit_without_envelope";
  }
  return "pipeline_exception";
}

/**
 * Record a failed run on its own connection. The caller's transaction rolls back (a
 * transaction must settle once), so the error row has to commit separately or it vanishes.
 */
export async function persistFailedPipelineRun(
  ctx: PipelineRunContext,
  input: { transactionId?: string; error: unknown },
): Promise<void> {
  const errorCode = classifyPipelineError(input.error);
  let client: PoolClient | null = null;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    await client.query(
      `INSERT INTO pipeline_runs
         (id, tenant_id, trigger, as_of_date, transaction_id, cron_batch_id, status)
       VALUES ($1, $2, $3, $4::date, $5, $6, 'running')
       ON CONFLICT (id) DO NOTHING`,
      [
        ctx.runId,
        ctx.tenantId,
        ctx.trigger,
        ctx.asOfDate,
        input.transactionId ?? null,
        ctx.cronBatchId ?? null,
      ],
    );
    await finishPipelineRun(client, {
      runId: ctx.runId,
      status: "error",
      forecastStale: false,
      cutsApplied: 0,
      oUnfundedCents: null,
      sDailyCents: null,
      sTodayCents: null,
      nP: null,
      sweepIncomplete: false,
      errorCode,
    });
    await client.query("COMMIT");
  } catch (persistError: unknown) {
    if (client) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    logger.error("Could not persist failed pipeline run", {
      runId: ctx.runId,
      tenantId: ctx.tenantId,
      error: persistError instanceof Error ? persistError.message : "unknown",
    });
  } finally {
    client?.release();
  }
}

/** Retention: runs (and, by cascade, steps) older than `days`. Returns rows deleted. */
export async function prunePipelineRuns(client: PoolClient, days: number): Promise<number> {
  const result = await client.query(
    `DELETE FROM pipeline_runs WHERE started_at < NOW() - make_interval(days => $1::int)`,
    [days],
  );
  return result.rowCount ?? 0;
}

/** Runs left `running` past `minutes` crashed without cleanup; close them as `error`. */
export async function closeAbandonedPipelineRuns(
  client: PoolClient,
  minutes: number,
): Promise<number> {
  const result = await client.query(
    `UPDATE pipeline_runs
     SET status = 'error', finished_at = NOW(), error_code = 'abandoned'
     WHERE status = 'running' AND started_at < NOW() - make_interval(mins => $1::int)`,
    [minutes],
  );
  return result.rowCount ?? 0;
}
