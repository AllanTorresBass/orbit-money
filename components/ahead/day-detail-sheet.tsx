"use client";

import { useLocale, useTranslations } from "next-intl";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useForecastDay } from "@/hooks/use-allowance";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import { dayNarrative } from "@/lib/utils/day-narrative";
import type { AppLocale } from "@/types/i18n/locale.types";

export interface DayDetailSheetProps {
  /** `YYYY-MM-DD` of the tapped row. Null keeps the sheet closed. */
  date: string | null;
  onClose: () => void;
  className?: string;
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--orbit-line)] py-3 text-[17px]">
      <span className="text-[var(--orbit-secondary)]">{label}</span>
      <span className="shrink-0 tabular-nums text-[var(--orbit-ink)]">{value}</span>
    </div>
  );
}

export function DayDetailSheet({ date, onClose, className }: DayDetailSheetProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("ahead");
  const day = useForecastDay(date);
  const fmt = (cents: number) => formatMoney(cents, { locale });

  if (date === null) return null;

  const detail = day.data;

  return (
    <OrbitSheet title={formatShortDate(date, locale)} onClose={onClose} className={className}>
        {day.isLoading ? (
          <div className="mt-6 animate-pulse space-y-3" aria-busy="true">
            <div className="h-6 w-full rounded bg-[var(--orbit-line)]" />
            <div className="h-6 w-full rounded bg-[var(--orbit-line)]" />
            <div className="h-6 w-full rounded bg-[var(--orbit-line)]" />
          </div>
        ) : day.isError || !detail ? (
          <p className="mt-6 text-[15px] text-[var(--orbit-short)]">{t("dayLoadError")}</p>
        ) : (
          <>
            <p
              className={cn(
                "mt-2 text-[17px] text-[var(--orbit-ink)]",
                detail.status === "breach" && "text-[var(--orbit-short)]",
                detail.status === "warning" && "text-[var(--orbit-low)]",
              )}
            >
              {dayNarrative(detail, fmt, t)}
            </p>
            <div className="mt-4">
              <DetailRow label={t("moneyInBank")} value={fmt(detail.balanceCents)} />
              <DetailRow label={t("keepAtLeast")} value={fmt(detail.keepAtLeastCents)} />
              {detail.inflowCents > 0 ? (
                <DetailRow label={t("payday")} value={`+${fmt(detail.inflowCents)}`} />
              ) : null}
              {detail.scheduledOutflowCents > 0 ? (
                <DetailRow label={t("bills")} value={`-${fmt(detail.scheduledOutflowCents)}`} />
              ) : null}
              {detail.assumedBurnCents > 0 ? (
                <DetailRow label={t("spending")} value={`-${fmt(detail.assumedBurnCents)}`} />
              ) : null}
            </div>
          </>
        )}
    </OrbitSheet>
  );
}
