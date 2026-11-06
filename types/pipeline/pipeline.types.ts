import { z } from "zod";
import { entityIdSchema } from "@/types/shared/ids";

/** Six-step pipeline order (docs/08) plus midnight-only boundary steps. */
export const pipelineStepSchema = z.enum([
  "settle",
  "sweep",
  "schedule_advance",
  "rate",
  "project",
  "floor_check",
  "cut",
  "publish",
]);

export type PipelineStep = z.infer<typeof pipelineStepSchema>;

/** Why a run ended the way it did. Short, PII-free, stored in `pipeline_runs.reason_code`. */
export const pipelineReasonCodeSchema = z.enum([
  "ok",
  "no_future_inflow",
  "holiday_calendar_missing",
  "breach_mitigated",
  "breach_alert",
  "sweep_skipped_no_sink",
]);
export type PipelineReasonCode = z.infer<typeof pipelineReasonCodeSchema>;

export const pipelineStepEventSchema = z.object({
  kind: z.literal("pipeline_step"),
  runId: z.string().uuid(),
  trigger: z.enum(["sync", "midnight"]),
  tenantId: z.string().uuid(),
  asOfDate: z.string(),
  step: pipelineStepSchema,
  centsIn: z.number().int().optional(),
  centsOut: z.number().int().optional(),
  settledCount: z.number().int().nonnegative().optional(),
  nP: z.number().int().nullable().optional(),
  sDailyCents: z.number().int().nullable().optional(),
  sTodayCents: z.number().int().nullable().optional(),
  oUnfundedCents: z.number().int().optional(),
  breachDate: z.string().nullable().optional(),
  gapCents: z.number().int().nullable().optional(),
  cutsApplied: z.number().int().optional(),
  idempotencyHit: z.boolean().optional(),
  sweepIncomplete: z.boolean().optional(),
  forecastStale: z.boolean().optional(),
  sweptCents: z.number().int().optional(),
  advancedOutflows: z.number().int().optional(),
  advancedInflows: z.number().int().optional(),
  durationMs: z.number().nonnegative().optional(),
  cronBatchId: z.string().uuid().optional(),
});

export type PipelineStepEvent = z.infer<typeof pipelineStepEventSchema>;

export interface PipelineRunSummary {
  runId: string;
  sTodayCents: number | null;
  sDailyCents: number | null;
  oUnfundedCents: number;
  nP: number | null;
  mitigated: boolean;
  forecastStale: boolean;
  cutsApplied: number;
  sweepIncomplete: boolean;
  reasonCode: string;
}

export interface PipelineRunListItem {
  id: string;
  trigger: "sync" | "midnight";
  asOfDate: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  forecastStale: boolean;
  cutsApplied: number;
  oUnfundedCents: number | null;
  sDailyCents: number | null;
  sTodayCents: number | null;
  nP: number | null;
  sweepIncomplete: boolean;
  cronBatchId: string | null;
  errorCode: string | null;
  reasonCode: string | null;
  /** Short truncated text for an error or abandoned run. Never shown raw in the UI. */
  errorMessage: string | null;
  /** C(0): bank balances at the start of the projection. */
  cashCents: number | null;
  triggeredByUserId: string | null;
  /** Present only when the caller asked for steps. */
  steps?: PipelineStepRow[];
}

export interface PipelineStepRow {
  id: string;
  step: string;
  startedAt: string;
  durationMs: number | null;
  /** Cents and counts only. No payee, memo, or email. */
  payload: Record<string, unknown>;
}

/** One active schedule as loaded once per run. Both the due-amount view and the 60-day expansion derive from it. */
export interface ScheduleSourceRow {
  envelopeId: string | null;
  amount: string;
  nextDueDate: string;
  direction: "inflow" | "outflow";
  recurrenceRrule: string;
}

export const pipelineRunsQuerySchema = z.object({
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  includeSteps: z
    .enum(["1", "true"])
    .optional()
    .transform((value) => value !== undefined),
});
export type PipelineRunsQuery = z.output<typeof pipelineRunsQuerySchema>;

export const pipelineRunIdParamSchema = z.object({ id: entityIdSchema });

export interface PipelineRunResponse {
  run: PipelineRunListItem;
}

/** One tenant with the day its published numbers are from. Input to the catch-up selector. */
export interface TenantSnapshotRow {
  id: string;
  timezone: string;
  /** `allowance_snapshots.as_of_date`. Null when the tenant has never published. */
  snapshotAsOfDate: string | null;
  /** Consecutive failed midnight runs. Reset by the next success. Absent counts as zero. */
  midnightFailCount?: number;
  /** Catch-up skips the tenant until this instant (ISO). Null or absent when not poisoned. */
  midnightFailUntil?: string | null;
}

/** What one tick's catch-up selection decided. */
export interface CatchUpSelection {
  /** Tenants to run, never-published first then oldest snapshot. At most the limit. */
  ids: string[];
  /** Stale tenants beyond the limit, left for the next tick. */
  staleBacklog: number;
  /** Stale tenants skipped because their midnight run keeps failing. */
  poisonSkipped: number;
}

/** Per-tick counters stored on `cron_batches`. */
export interface CronBatchCounts {
  dueCount: number;
  okCount: number;
  errorCount: number;
  skippedCount: number;
}

/** Health view of the newest finished cron batch and the migration state. */
export interface HealthMigrations {
  /** Rows in `schema_migrations`. */
  applied: number;
  /** `.sql` files shipped in `db/migrations`. Null when the folder is not readable. */
  expected: number | null;
}

export interface HealthResponse {
  ok: boolean;
  db: boolean;
  migrations: HealthMigrations;
  /** Seconds since the newest finished cron batch. Null when none has finished. */
  cronBatchAgeSec: number | null;
}

export interface CronBatchSummary {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  dueCount: number;
  okCount: number;
  errorCount: number;
  skippedCount: number;
}

export interface PipelineRunListResponse {
  runs: PipelineRunListItem[];
  latestBatch: CronBatchSummary | null;
}
