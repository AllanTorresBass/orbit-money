"use client";

import { useForecastDay } from "@/hooks/use-allowance";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import type { ForecastStatus } from "@/types/forecast/forecast.types";

export interface DayDetailSheetProps {
  /** `YYYY-MM-DD` of the tapped row. Null keeps the sheet closed. */
  date: string | null;
  onClose: () => void;
  className?: string;
}

function statusLine(status: ForecastStatus): string | null {
  if (status === "breach") return "Not enough ahead";
  if (status === "warning") return "Getting low";
  return null;
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
  const line = detail ? statusLine(detail.status) : null;

  return (
    <div
      className={cn("fixed inset-0 z-40 flex items-end justify-center bg-black/30", className)}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${formatShortDate(date)} details`}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--orbit-paper)] p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="text-[15px] text-[var(--orbit-secondary)]">
          Close
        </button>
        <h2 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
          {formatShortDate(date)}
        </h2>

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
            {line ? (
              <p
                className={cn(
                  "mt-2 text-[15px]",
                  detail.status === "breach"
                    ? "text-[var(--orbit-short)]"
                    : "text-[var(--orbit-low)]",
                )}
              >
                {line}
              </p>
            ) : null}
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
            {detail.inflowCents === 0 &&
            detail.scheduledOutflowCents === 0 &&
            detail.assumedBurnCents === 0 ? (
              <p className="mt-4 text-[15px] text-[var(--orbit-secondary)]">
                Nothing moves on this day.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
