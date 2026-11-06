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
  const activity = usePipelineRuns(canManage, 8);
  const runs = activity.data?.runs ?? [];
  const batch = activity.data?.latestBatch ?? null;

  if (!canManage) {
    return null;
  }

  return (
    <section className={cn("mt-10", className)} aria-labelledby="you-activity">
      <h2 id="you-activity" className="text-[15px] font-medium text-[var(--orbit-ink)]">
        Activity
      </h2>
      {activity.isPending ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">Loading…</p>
      ) : activity.isError ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
          {fetchErrorMessage(activity.error, "activity")}
        </p>
      ) : (
        <>
          {batch ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
              Last overnight pass · {batch.okCount} ok
              {batch.errorCount > 0 ? ` · ${batch.errorCount} failed` : ""}
              {batch.skippedCount > 0 ? ` · ${batch.skippedCount} skipped` : ""}
            </p>
          ) : null}
          {runs.length === 0 ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
              Nothing yet. Checks show up here after your first purchase or payday.
            </p>
          ) : (
            <ul className="mt-2 space-y-3">
              {runs.map((run) => {
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
        </>
      )}
    </section>
  );
}
