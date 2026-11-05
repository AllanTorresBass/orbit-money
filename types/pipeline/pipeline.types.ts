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

export const pipelineStepEventSchema = z.object({
  kind: z.literal("pipeline_step"),
  runId: z.string().uuid(),
  trigger: z.enum(["sync", "midnight"]),
  tenantId: z.string().uuid(),
  asOfDate: z.string(),
  step: pipelineStepSchema,
  centsIn: z.number().int().optional(),
  centsOut: z.number().int().optional(),
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

export interface PipelineRunListResponse {
  runs: PipelineRunListItem[];
}

export interface PipelineRunResponse {
  run: PipelineRunListItem;
}
