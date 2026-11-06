import type { PipelineRunListItem } from "@/types/pipeline/pipeline.types";

export interface RunStatusLabel {
  label: string;
  /** `short` needs attention. `low` is informational. */
  tone: "low" | "short" | "ok";
}

/** Plain-word status for a run. No engine vocabulary on screen. */
export function runStatusLabel(run: PipelineRunListItem): RunStatusLabel {
  if (run.status === "error") return { label: "Failed", tone: "short" };
  if (run.status === "running") return { label: "Running", tone: "low" };
  if (run.status === "stale" || run.forecastStale) return { label: "Out of date", tone: "short" };
  if (run.sweepIncomplete) return { label: "Leftover could not move", tone: "low" };
  return { label: "Done", tone: "ok" };
}

const REASON_SENTENCES: Record<string, string> = {
  no_future_inflow: "No payday is ahead, so there is no daily amount.",
  holiday_calendar_missing: "The holiday calendar is missing. The last numbers are kept.",
  breach_mitigated: "Daily spending was lowered to stay above what you keep.",
  breach_alert: "Your balance is set to drop below what you keep.",
  sweep_skipped_no_sink: "Leftover money had no goal to move to.",
  abandoned: "This check stopped before it finished.",
  missing_discretionary: "Spending is missing from this household.",
  tenant_not_found: "This household could not be found.",
  debit_without_envelope: "A payment was not tied to a bill.",
  pipeline_exception: "Something went wrong. Orbit will try again overnight.",
};

/**
 * One plain sentence for why a run ended the way it did, or null when nothing is worth saying.
 * Reads the reason code, then the error code. Unknown codes get a generic line, never the code.
 */
export function runReasonLabel(run: PipelineRunListItem): string | null {
  const code = run.reasonCode ?? run.errorCode;
  if (code === null || code === "ok") {
    return run.status === "error" ? REASON_SENTENCES.pipeline_exception : null;
  }
  const known = REASON_SENTENCES[code];
  if (known) return known;
  if (code.startsWith("pg_")) return "A database error stopped this check.";
  return run.status === "error" || run.status === "stale"
    ? REASON_SENTENCES.pipeline_exception
    : null;
}

/** Whole milliseconds between start and finish, or null while still running. */
export function runDurationMs(run: PipelineRunListItem): number | null {
  if (!run.finishedAt) return null;
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
