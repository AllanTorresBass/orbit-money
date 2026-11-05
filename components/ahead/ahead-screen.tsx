"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { AheadSkeleton } from "@/components/ahead/ahead-skeleton";
import { DayDetailSheet } from "@/components/ahead/day-detail-sheet";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { useAllowance, useForecast, useMe } from "@/hooks/use-allowance";
import { isApiError } from "@/lib/api/api-error";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import type { ForecastDayDto, ForecastStatus } from "@/types/forecast/forecast.types";

export interface AheadScreenProps {
  className?: string;
}

interface AheadRow {
  key: string;
  date: string;
  label: string;
  amountCents: number;
  /** Shown under the label on a day that is getting low or short. */
  note: string | null;
  status: ForecastStatus;
}

function statusNote(status: ForecastStatus): string | null {
  if (status === "breach") return "Not enough ahead";
  if (status === "warning") return "Getting low";
  return null;
}

/** Only the days that move the line: payday, bills leaving, and low or short days. */
function rowsForDays(days: ForecastDayDto[]): AheadRow[] {
  const rows: AheadRow[] = [];
  for (const day of days) {
    const note = statusNote(day.status);
    if (day.inflowCents > 0) {
      rows.push({
        key: `${day.dayOffset}-in`,
        date: day.forecastDate,
        label: "Payday",
        amountCents: day.inflowCents,
        note,
        status: day.status,
      });
    }
    if (day.scheduledOutflowCents > 0) {
      rows.push({
        key: `${day.dayOffset}-out`,
        date: day.forecastDate,
        label: "Bills leave",
        amountCents: day.scheduledOutflowCents,
        note: day.inflowCents > 0 ? null : note,
        status: day.status,
      });
    }
    if (day.inflowCents === 0 && day.scheduledOutflowCents === 0 && note) {
      rows.push({
        key: `${day.dayOffset}-status`,
        date: day.forecastDate,
        label: note,
        amountCents: day.balanceCents,
        note: null,
        status: day.status,
      });
    }
  }
  return rows;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function AheadScreen({ className }: AheadScreenProps) {
  const forecast = useForecast();
  const allowance = useAllowance();
  const me = useMe();
  // `?date=YYYY-MM-DD` opens that day and marks its row, e.g. from the Today banner.
  const requested = useSearchParams().get("date");
  const linkedDate = requested !== null && ISO_DATE.test(requested) ? requested : null;
  const [openDate, setOpenDate] = useState<string | null>(linkedDate);
  const scrolled = useRef(false);

  if (forecast.isLoading) {
    return <AheadSkeleton className={className} />;
  }

  if (isApiError(forecast.error) && forecast.error.code === "tenant_selection_required") {
    return <TenantPicker tenants={forecast.error.tenants} className={className} />;
  }

  if (forecast.isError || !forecast.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        <p className="text-[var(--orbit-short)]">{fetchErrorMessage(forecast.error, "ahead")}</p>
      </div>
    );
  }

  if (forecast.data.days.length === 0) {
    return (
      <div className={cn("mx-auto max-w-md px-6 pt-10", className)}>
        <p className="text-[var(--orbit-secondary)]">Nothing to show yet.</p>
      </div>
    );
  }

  const days = forecast.data.days;
  const rows = rowsForDays(days);
  const bank = allowance.data;
  const canChooseFloor = me.data?.role === "owner" || me.data?.role === "admin";
  const keepSentence = bank
    ? bank.breachDate
      ? `${formatShortDate(bank.breachDate)} drops below the ${formatMoney(bank.keepAtLeastCents)} you want to keep.`
      : `The bank stays above ${formatMoney(bank.keepAtLeastCents)}.`
    : null;
  const maxBal = Math.max(...days.map((d) => d.balanceCents), 1);
  const minBal = Math.min(...days.map((d) => d.balanceCents), 0);
  const span = Math.max(maxBal - minBal, 1);

  const points = days
    .map((d, i) => {
      const x = (i / Math.max(days.length - 1, 1)) * 100;
      const y = 100 - ((d.balanceCents - minBal) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-6 pb-28 pt-8", className)}>
      <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
        Ahead
      </h1>
      {bank ? (
        <>
          <p className="mt-6 text-[15px] text-[var(--orbit-secondary)]">
            All money in connected accounts
          </p>
          <p className="mt-1 font-[family-name:var(--font-orbit-serif)] text-[40px] leading-none tabular-nums text-[var(--orbit-ink)]">
            {formatMoney(bank.bankTotalCents)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[15px] text-[var(--orbit-secondary)]">
          Money in the bank for the next 60 days.
        </p>
      )}

      <svg viewBox="0 0 100 100" className="mt-8 h-48 w-full" role="img" aria-label="Bank balance timeline">
        <polyline
          fill="none"
          stroke="var(--orbit-ink)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          points={points}
        />
      </svg>

      {keepSentence ? (
        <p className="mt-6 text-[17px] text-[var(--orbit-ink)]">{keepSentence}</p>
      ) : null}
      {bank && bank.keepAtLeastCents === 0 && canChooseFloor ? (
        <Link href="/you" className="mt-2 block text-[15px] text-[var(--orbit-secondary)]">
          Choose an amount to keep.
        </Link>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-8 text-[15px] text-[var(--orbit-secondary)]">
          Nothing leaves or arrives in the next 60 days.
        </p>
      ) : (
        <ul className="mt-8">
          {rows.map((row) => (
            <li
              key={row.key}
              id={`ahead-${row.date}`}
              aria-current={row.date === linkedDate ? "date" : undefined}
              ref={(node) => {
                if (node && row.date === linkedDate && !scrolled.current) {
                  scrolled.current = true;
                  node.scrollIntoView({ block: "center" });
                }
              }}
              className={cn(
                "border-b border-[var(--orbit-line)]",
                row.date === linkedDate && "border-l-2 border-l-[var(--orbit-ink)] pl-3",
              )}
            >
              <button
                type="button"
                onClick={() => setOpenDate(row.date)}
                className="flex w-full items-baseline gap-3 py-3 text-left text-[15px]"
              >
                <span className="w-14 shrink-0 text-[var(--orbit-secondary)]">
                  {formatShortDate(row.date)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[var(--orbit-ink)]">{row.label}</span>
                  {row.note ? (
                    <span
                      className={cn(
                        "block text-[13px]",
                        row.status === "breach"
                          ? "text-[var(--orbit-short)]"
                          : "text-[var(--orbit-low)]",
                      )}
                    >
                      {row.note}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--orbit-ink)]">
                  {formatMoney(row.amountCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DayDetailSheet date={openDate} onClose={() => setOpenDate(null)} />
    </div>
  );
}
