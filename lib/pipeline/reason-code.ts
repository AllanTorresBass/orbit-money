import type { PipelineReasonCode } from "@/types/pipeline/pipeline.types";

/** The one reason that best explains a finished run. Earlier checks win. */
export function pickReasonCode(input: {
  nP: number | null;
  cutsApplied: number;
  /** First breach still left after mitigation, if any. */
  breachDate: string | null;
  sweepSkippedNoSink: boolean;
}): PipelineReasonCode {
  if (input.nP === null) return "no_future_inflow";
  if (input.breachDate !== null) return "breach_alert";
  if (input.cutsApplied > 0) return "breach_mitigated";
  if (input.sweepSkippedNoSink) return "sweep_skipped_no_sink";
  return "ok";
}
