import type { PipelineRunListItem } from "@/types/pipeline/pipeline.types";

type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface RunStatusLabel {
  label: string;
  /** `short` needs attention. `low` is informational. */
  tone: "low" | "short" | "ok";
}

/** Plain-word status for a run. No engine vocabulary on screen. */
export function runStatusLabel(run: PipelineRunListItem, t: Translate): RunStatusLabel {
  if (run.status === "error") return { label: t("failed"), tone: "short" };
  if (run.status === "running") return { label: t("running"), tone: "low" };
  if (run.status === "stale" || run.forecastStale) return { label: t("outOfDate"), tone: "short" };
  if (run.sweepIncomplete) return { label: t("leftoverStuck"), tone: "low" };
  return { label: t("done"), tone: "ok" };
}

const REASON_KEYS: Record<string, string> = {
  no_future_inflow: "reasons.no_future_inflow",
  holiday_calendar_missing: "reasons.holiday_calendar_missing",
  breach_mitigated: "reasons.breach_mitigated",
  breach_alert: "reasons.breach_alert",
  sweep_skipped_no_sink: "reasons.sweep_skipped_no_sink",
  abandoned: "reasons.abandoned",
  missing_discretionary: "reasons.missing_discretionary",
  tenant_not_found: "reasons.tenant_not_found",
  debit_without_envelope: "reasons.debit_without_envelope",
  pipeline_exception: "reasons.pipeline_exception",
};

/**
 * One plain sentence for why a run ended the way it did, or null when nothing is worth saying.
 * Reads the reason code, then the error code. Unknown codes get a generic line, never the code.
 */
export function runReasonLabel(run: PipelineRunListItem, t: Translate): string | null {
  const code = run.reasonCode ?? run.errorCode;
  if (code === null || code === "ok") {
    return run.status === "error" ? t("reasons.pipeline_exception") : null;
  }
  const known = REASON_KEYS[code];
  if (known) return t(known);
  if (code.startsWith("pg_")) return t("reasons.database_error");
  return run.status === "error" || run.status === "stale"
    ? t("reasons.pipeline_exception")
    : null;
}

/** Whole milliseconds between start and finish, or null while still running. */
export function runDurationMs(run: PipelineRunListItem): number | null {
  if (!run.finishedAt) return null;
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function formatDuration(ms: number | null, t: Translate): string {
  if (ms === null) return t("emDash");
  if (ms < 1000) return t("durationMs", { count: ms });
  return t("durationSeconds", { seconds: (ms / 1000).toFixed(1) });
}
