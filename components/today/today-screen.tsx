"use client";

import Link from "next/link";
import { useState } from "react";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { PurchaseSheet } from "@/components/today/purchase-sheet";
import { TodaySkeleton } from "@/components/today/today-skeleton";
import { useAllowance, useMe } from "@/hooks/use-allowance";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { isApiError } from "@/lib/api/api-error";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";

export interface TodayScreenProps {
  className?: string;
}

export function TodayScreen({ className }: TodayScreenProps) {
  const me = useMe();
  const allowance = useAllowance();
  const online = useOnlineStatus();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (me.isLoading || allowance.isLoading) {
    return <TodaySkeleton className={className} />;
  }

  const selectionError = [me.error, allowance.error].find(
    (error) => isApiError(error) && error.code === "tenant_selection_required",
  );
  if (isApiError(selectionError)) {
    return <TenantPicker tenants={selectionError.tenants} className={className} />;
  }

  if (me.isError || allowance.isError || !allowance.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        {!online ? (
          <p className="border-l-2 border-[var(--orbit-low)] pl-3 text-[15px] text-[var(--orbit-ink)]">
            You&apos;re offline.
          </p>
        ) : null}
        <p className="mt-4 text-[var(--orbit-short)]">
          {fetchErrorMessage(allowance.error ?? me.error, "today")}
        </p>
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
  const keepAtLeast = formatMoney(data.keepAtLeastCents);
  const bannerLabel = data.breachDate
    ? `${formatShortDate(data.breachDate)} drops below the ${keepAtLeast} you want to keep.`
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

      {!online ? (
        <p
          role="status"
          className="mt-6 border-l-2 border-[var(--orbit-low)] pl-3 text-[15px] text-[var(--orbit-ink)]"
        >
          You&apos;re offline. Today&apos;s number is from earlier.
        </p>
      ) : null}

      {online && data.forecastStale ? (
        <p
          role="status"
          className="mt-6 border-l-2 border-[var(--orbit-low)] pl-3 text-[15px] text-[var(--orbit-ink)]"
        >
          Ahead could not refresh. You are seeing the last one.
        </p>
      ) : null}

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
