import { isServiceError } from "@/lib/errors/service-errors";
import {
  beginPipelineRun,
  discardPipelineRun,
  persistFailedPipelineRun,
  type PipelineRunContext,
} from "@/lib/pipeline/telemetry";

export interface WithPipelineRunInput {
  tenantId: string;
  trigger: "sync" | "midnight";
  asOfDate?: string;
  transactionId?: string;
  cronBatchId?: string;
  triggeredByUserId?: string;
}

/**
 * Open a `running` run on its own connection, then do the money work.
 * - Rejected requests (a `ServiceError`) leave no run: nothing was evaluated.
 * - Any other throw is recorded as an `error` run, so a rollback never erases the evidence.
 * - A crash before either leaves the run `running` for the abandoned sweep to close.
 * `work` receives the context to pass on as `runId` with `runPreStarted: true`.
 */
export async function withPipelineRun<T>(
  input: WithPipelineRunInput,
  work: (run: PipelineRunContext) => Promise<T>,
): Promise<T> {
  const run = await beginPipelineRun(input);
  try {
    return await work(run);
  } catch (error: unknown) {
    if (isServiceError(error)) {
      await discardPipelineRun(run.runId);
    } else {
      await persistFailedPipelineRun(run, { transactionId: input.transactionId, error });
    }
    throw error;
  }
}
