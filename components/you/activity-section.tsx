"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePipelineRuns } from "@/hooks/use-pipeline-runs";
import { cn, formatShortDate } from "@/lib/utils";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import {
  formatDuration,
  runDurationMs,
  runReasonLabel,
  runStatusLabel,
} from "@/lib/utils/pipeline-labels";

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
  const locale = useLocale();
  const t = useTranslations("you");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tPipeline = useTranslations("pipeline");

  if (!canManage) {
    return null;
  }

  return (
    <section className={cn("mt-10", className)} aria-labelledby="you-activity">
      <h2 id="you-activity" className="text-[15px] font-medium text-[var(--orbit-ink)]">
        {t("activityTitle")}
      </h2>
      {activity.isPending ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{tCommon("loading")}</p>
      ) : activity.isError ? (
        <p className="mt-2 text-[15px] text-[var(--orbit-short)]">
          {fetchErrorMessage(activity.error, tErrors("resource.activity"), {
            chooseHousehold: tErrors("chooseHousehold"),
            signIn: tErrors("signIn"),
            cannotSee: tErrors("cannotSee"),
            offline: tErrors("offline"),
            couldNotLoad: tErrors("couldNotLoad"),
          })}
        </p>
      ) : (
        <>
          {batch ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
              {t("activityBatch", {
                ok: batch.okCount,
                failed:
                  batch.errorCount > 0
                    ? t("activityFailed", { count: batch.errorCount })
                    : "",
                skipped:
                  batch.skippedCount > 0
                    ? t("activitySkipped", { count: batch.skippedCount })
                    : "",
              })}
            </p>
          ) : null}
          {runs.length === 0 ? (
            <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">{t("activityEmpty")}</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {runs.map((run) => {
                const status = runStatusLabel(run, tPipeline);
                const reason = runReasonLabel(run, tPipeline);
                const triggerLabel =
                  run.trigger === "midnight" ? t("activityOvernight") : t("activityAfterChange");
                return (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[var(--orbit-line)] pb-3"
                  >
                    <span className="text-[17px] text-[var(--orbit-ink)]">
                      {formatShortDate(run.asOfDate, locale)}
                      <span className="text-[15px] text-[var(--orbit-secondary)]">
                        {triggerLabel}
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
                      {status.label} · {formatDuration(runDurationMs(run), tCommon)}
                    </span>
                    {reason ? (
                      <span className="basis-full text-[15px] text-[var(--orbit-secondary)]">
                        {reason}
                      </span>
                    ) : null}
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
