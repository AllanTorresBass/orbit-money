import { logger } from "@/lib/logger";
import type { PipelineStepEvent } from "@/types/pipeline/pipeline.types";

/** Emit one structured pipeline step event (no PII / payee data). */
export function emitPipelineStep(
  event: Omit<PipelineStepEvent, "kind"> & { durationMs?: number },
): void {
  logger.info("pipeline_step", {
    kind: "pipeline_step",
    ...event,
  });
}
