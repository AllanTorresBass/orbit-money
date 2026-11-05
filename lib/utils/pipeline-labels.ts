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
