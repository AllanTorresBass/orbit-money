"use client";

import { usePipelineRuns } from "@/hooks/use-pipeline-runs";
import { cn, formatShortDate } from "@/lib/utils";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import { formatDuration, runDurationMs, runStatusLabel } from "@/lib/utils/pipeline-labels";

export interface ActivitySectionProps {
  /** Only owners and admins can read activity. */
  canManage: boolean;
  className?: string;
}

/** Recent checks Orbit ran on your numbers. Counts and times only. */
export function ActivitySection({ canManage, className }: ActivitySectionProps) {
  const runs = usePipelineRuns(canManage, 8);

  if (!canManage) {
    return null;
  }

  return (
    <section className={cn("mt-10", className)} aria-labelledby="you-activity">
      <h2 id="you-activity" className="text-[15px] font-medium text-[var(--orbit-ink)]">
        Activity
      </h2>
      {runs.isPending ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">Loading…</p>
      ) : runs.isError ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
          {fetchErrorMessage(runs.error, "activity")}
        </p>
      ) : runs.data.length === 0 ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
          Nothing yet. Checks show up here after your first purchase or payday.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {runs.data.map((run) => {
            const status = runStatusLabel(run);
            return (
              <li
                key={run.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[var(--orbit-line)] pb-3"
              >
                <span className="text-[17px] text-[var(--orbit-ink)]">
                  {formatShortDate(run.asOfDate)}
                  <span className="text-[15px] text-[var(--orbit-secondary)]">
                    {run.trigger === "midnight" ? " · Overnight" : " · After a change"}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[15px]",
                    status.tone === "short"
                      ? "text-[var(--orbit-short)]"
                      : "text-[var(--orbit-secondary)]",
                  )}
                >
                  {status.label} · {formatDuration(runDurationMs(run))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
