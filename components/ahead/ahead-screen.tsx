"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
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
import type { AppLocale } from "@/types/i18n/locale.types";

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

type AheadTranslate = (key: string, values?: Record<string, string | number>) => string;

function statusNote(status: ForecastStatus, t: AheadTranslate): string | null {
  if (status === "breach") return t("notEnoughAhead");
  if (status === "warning") return t("gettingLow");
  return null;
}

/** Only the days that move the line: payday, bills leaving, and low or short days. */
function rowsForDays(days: ForecastDayDto[], t: AheadTranslate): AheadRow[] {
  const rows: AheadRow[] = [];
  for (const day of days) {
    const note = statusNote(day.status, t);
    if (day.inflowCents > 0) {
      rows.push({
        key: `${day.dayOffset}-in`,
        date: day.forecastDate,
        label: t("payday"),
        amountCents: day.inflowCents,
        note,
        status: day.status,
      });
    }
    if (day.scheduledOutflowCents > 0) {
      rows.push({
        key: `${day.dayOffset}-out`,
        date: day.forecastDate,
        label: t("billsLeave"),
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
  const locale = useLocale() as AppLocale;
  const t = useTranslations("ahead");
  const tErrors = useTranslations("errors");
  const fmt = (cents: number) => formatMoney(cents, { locale });

  const forecast = useForecast();
  const allowance = useAllowance();
  const me = useMe();
  const requested = useSearchParams().get("date");
  const linkedDate = requested !== null && ISO_DATE.test(requested) ? requested : null;
  const [openDate, setOpenDate] = useState<string | null>(linkedDate);
  const scrolled = useRef(false);

  const fetchCopy = {
    chooseHousehold: tErrors("chooseHousehold"),
    signIn: tErrors("signIn"),
    cannotSee: tErrors("cannotSee"),
    offline: tErrors("offline"),
    couldNotLoad: tErrors("couldNotLoad"),
  };

  if (forecast.isLoading) {
    return <AheadSkeleton className={className} />;
  }

  if (isApiError(forecast.error) && forecast.error.code === "tenant_selection_required") {
    return <TenantPicker tenants={forecast.error.tenants} className={className} />;
  }

  if (forecast.isError || !forecast.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        <p className="text-[var(--orbit-short)]">
          {fetchErrorMessage(forecast.error, tErrors("resource.ahead"), fetchCopy)}
        </p>
      </div>
    );
  }

  if (forecast.data.days.length === 0) {
    return (
      <div className={cn("mx-auto max-w-md px-5 pt-10", className)}>
        <p className="text-[var(--orbit-secondary)]">{t("empty")}</p>
      </div>
    );
  }

  const days = forecast.data.days;
  const rows = rowsForDays(days, t);
  const bank = allowance.data;
  const canChooseFloor = me.data?.role === "owner" || me.data?.role === "admin";
  const keepSentence = bank
    ? bank.breachDate
      ? t("keepBreach", {
          date: formatShortDate(bank.breachDate, locale),
          amount: fmt(bank.keepAtLeastCents),
        })
      : t("keepOk", { amount: fmt(bank.keepAtLeastCents) })
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
    <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-28 pt-8", className)}>
      <h1 className="font-[family-name:var(--font-orbit-display)] text-[32px] font-semibold leading-tight tracking-tight text-[var(--orbit-ink)]">
        {t("title")}
      </h1>
      <section className="orbit-group mt-4 p-5">
        {bank ? (
          <>
            <p className="text-[14px] text-[var(--orbit-secondary)]">{t("allAccounts")}</p>
            <p className="mt-1 font-[family-name:var(--font-orbit-display)] text-[40px] font-semibold leading-none tracking-tight tabular-nums text-[var(--orbit-ink)]">
              {fmt(bank.bankTotalCents)}
            </p>
          </>
        ) : (
          <p className="text-[15px] text-[var(--orbit-secondary)]">{t("fallbackSummary")}</p>
        )}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="mt-6 h-40 w-full overflow-visible"
          role="img"
          aria-label={t("chartAria")}
        >
          <defs>
            <linearGradient id="ahead-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--orbit-brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--orbit-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${points} 100,100`} fill="url(#ahead-fill)" />
          <polyline
            fill="none"
            stroke="var(--orbit-brand)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={points}
          />
        </svg>
      </section>

      {keepSentence ? (
        <p className="mt-6 text-[17px] leading-relaxed text-[var(--orbit-ink)]">{keepSentence}</p>
      ) : null}
      {bank && bank.keepAtLeastCents === 0 && canChooseFloor ? (
        <Link href="/you" className="orbit-link mt-2 block text-[15px]">
          {t("chooseKeep")}
        </Link>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-8 text-[15px] text-[var(--orbit-secondary)]">{t("noEvents")}</p>
      ) : (
        <ul className="orbit-group mt-8">
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
              className={cn(row.date === linkedDate && "bg-[var(--orbit-brand-soft)]")}
            >
              <button
                type="button"
                onClick={() => setOpenDate(row.date)}
                className="flex w-full items-baseline gap-3 px-4 py-3.5 text-left text-[15px] transition-colors hover:bg-[var(--orbit-brand-soft)]"
              >
                <span className="w-14 shrink-0 text-[var(--orbit-secondary)]">
                  {formatShortDate(row.date, locale)}
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
                  {fmt(row.amountCents)}
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
