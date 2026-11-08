"use client";

import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useForecastDay } from "@/hooks/use-allowance";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import { dayNarrative } from "@/lib/utils/day-narrative";

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
  const day = useForecastDay(date);

  if (date === null) return null;

  const detail = day.data;

  return (
    <OrbitSheet title={formatShortDate(date)} onClose={onClose} className={className}>
        {day.isLoading ? (
          <div className="mt-6 animate-pulse space-y-3" aria-busy="true">
            <div className="h-6 w-full rounded bg-[var(--orbit-line)]" />
            <div className="h-6 w-full rounded bg-[var(--orbit-line)]" />
            <div className="h-6 w-full rounded bg-[var(--orbit-line)]" />
          </div>
        ) : day.isError || !detail ? (
          <p className="mt-6 text-[15px] text-[var(--orbit-short)]">Could not load this day.</p>
        ) : (
          <>
            <p
              className={cn(
                "mt-2 text-[17px] text-[var(--orbit-ink)]",
                detail.status === "breach" && "text-[var(--orbit-short)]",
                detail.status === "warning" && "text-[var(--orbit-low)]",
              )}
            >
              {dayNarrative(detail)}
            </p>
            <div className="mt-4">
              <DetailRow label="Money in the bank" value={formatMoney(detail.balanceCents)} />
              <DetailRow label="Keep at least" value={formatMoney(detail.keepAtLeastCents)} />
              {detail.inflowCents > 0 ? (
                <DetailRow label="Payday" value={`+${formatMoney(detail.inflowCents)}`} />
              ) : null}
              {detail.scheduledOutflowCents > 0 ? (
                <DetailRow label="Bills" value={`-${formatMoney(detail.scheduledOutflowCents)}`} />
              ) : null}
              {detail.assumedBurnCents > 0 ? (
                <DetailRow label="Spending" value={`-${formatMoney(detail.assumedBurnCents)}`} />
              ) : null}
            </div>
          </>
        )}
    </OrbitSheet>
  );
}
