import { z } from "zod";

export const pipelineStepSchema = z.enum([
  "settle",
  "rate",
  "project",
  "floor_check",
  "cut",
  "publish",
]);

export type PipelineStep = z.infer<typeof pipelineStepSchema>;

export const pipelineStepEventSchema = z.object({
  kind: z.literal("pipeline_step"),
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
  durationMs: z.number().nonnegative().optional(),
});

export type PipelineStepEvent = z.infer<typeof pipelineStepEventSchema>;

export interface PipelineRunSummary {
  sTodayCents: number | null;
  sDailyCents: number | null;
  oUnfundedCents: number;
  nP: number | null;
  mitigated: boolean;
  forecastStale: boolean;
  cutsApplied: number;
}
