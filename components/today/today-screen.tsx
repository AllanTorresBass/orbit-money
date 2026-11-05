"use client";

import Link from "next/link";
import { useState } from "react";
import { PurchaseSheet } from "@/components/today/purchase-sheet";
import { useAllowance, useMe } from "@/hooks/use-allowance";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";

export interface TodayScreenProps {
  className?: string;
}

export function TodayScreen({ className }: TodayScreenProps) {
  const me = useMe();
  const allowance = useAllowance();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (me.isLoading || allowance.isLoading) {
    return <TodaySkeleton className={className} />;
  }

  if (me.isError || allowance.isError || !allowance.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        <p className="text-[var(--orbit-short)]">Could not load today.</p>
      </div>
    );
  }

  const data = allowance.data;
  const pastPace = data.sTodayCents < 0;
  const heroColor =
    pastPace || data.breachDate
      ? "text-[var(--orbit-ink)]"
      : "text-[var(--orbit-fine)]";

  const bannerDate = data.breachDate ?? data.warningDate;
  const bannerLabel = data.breachDate
    ? `${formatShortDate(data.breachDate)} drops below the amount you want to keep.`
    : data.warningDate
      ? `${formatShortDate(data.warningDate)} is getting low.`
      : null;

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-6 pb-28 pt-8", className)}>
      <Link href="/you" className="block">
        <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
          {data.tenantName}
        </h1>
        <p className="text-[15px] text-[var(--orbit-secondary)]">Household</p>
      </Link>

      {bannerLabel && bannerDate ? (
        <Link
          href="/ahead"
          className="mt-6 block border-l-2 border-[var(--orbit-short)] pl-3 text-[15px] text-[var(--orbit-ink)]"
        >
          {bannerLabel}
        </Link>
      ) : null}

      <p className="mt-10 text-[15px] text-[var(--orbit-secondary)]">
        {pastPace ? "Past today's pace" : "You can spend"}
      </p>
      <p
        className={cn(
          "mt-1 font-[family-name:var(--font-orbit-serif)] text-[72px] leading-none tabular-nums",
          heroColor,
        )}
      >
        {formatMoney(Math.abs(data.sTodayCents), { alwaysCents: true })}
      </p>
      <p className="mt-3 text-[15px] text-[var(--orbit-secondary)]">
        {pastPace
          ? `Tomorrow's pace will be ${formatMoney(data.sDailyCents, { alwaysCents: true })}.`
          : data.nextPayday
            ? `Until payday on ${formatShortDate(data.nextPayday)}.`
            : "Add a payday to see a daily amount."}
      </p>

      {me.data?.canSpend ? (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-10 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)]"
        >
          Add a purchase
        </button>
      ) : null}

      <PurchaseSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

interface TodaySkeletonProps {
  className?: string;
}

function TodaySkeleton({ className }: TodaySkeletonProps) {
  return (
    <div className={cn("mx-auto max-w-md animate-pulse px-6 pt-8", className)}>
      <div className="h-8 w-40 rounded bg-[var(--orbit-line)]" />
      <div className="mt-16 h-4 w-28 rounded bg-[var(--orbit-line)]" />
      <div className="mt-4 h-16 w-56 rounded bg-[var(--orbit-line)]" />
      <div className="mt-4 h-4 w-48 rounded bg-[var(--orbit-line)]" />
      <div className="mt-10 h-12 w-full rounded bg-[var(--orbit-line)]" />
    </div>
  );
}
