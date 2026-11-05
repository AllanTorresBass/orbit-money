import type { PoolClient } from "pg";
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
    `INSERT INTO pipeline_steps (run_id, tenant_id, step, duration_ms, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
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
