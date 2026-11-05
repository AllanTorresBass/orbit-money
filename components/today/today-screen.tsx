"use client";

import Link from "next/link";
import { useState } from "react";
import { InlineBanner } from "@/components/shell/inline-banner";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { PurchaseSheet } from "@/components/today/purchase-sheet";
import { TodaySkeleton } from "@/components/today/today-skeleton";
import { useAllowance, useMe } from "@/hooks/use-allowance";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useQueuedPurchaseCount } from "@/hooks/use-queued-purchase-count";
import { isApiError } from "@/lib/api/api-error";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import { tenantTypeLabel } from "@/lib/utils/display-labels";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";

export interface TodayScreenProps {
  className?: string;
}

function queuedPurchaseSentence(count: number): string {
  return count === 1
    ? "1 purchase is saved on this phone. It sends when you're back online."
    : `${count} purchases are saved on this phone. They send when you're back online.`;
}

export function TodayScreen({ className }: TodayScreenProps) {
  const me = useMe();
  const allowance = useAllowance();
  const online = useOnlineStatus();
  const queuedPurchases = useQueuedPurchaseCount();
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

  const typeLabel = me.data ? tenantTypeLabel(me.data.tenantType) : null;

  // Created, but the first number has not been worked out yet.
  if (me.data && isApiError(allowance.error) && allowance.error.status === 404) {
    return (
      <div className={cn("mx-auto min-h-screen max-w-md px-6 pb-28 pt-8", className)}>
        <Link href="/you" className="block">
          <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
            {me.data.tenantName}
          </h1>
          {typeLabel ? (
            <p className="text-[15px] text-[var(--orbit-secondary)]">{typeLabel}</p>
          ) : null}
        </Link>
        <InlineBanner className="mt-6">
          This is your first day. Orbit is still working out your number. Check back in a moment.
        </InlineBanner>
        {queuedPurchases > 0 ? (
          <InlineBanner className="mt-4">{queuedPurchaseSentence(queuedPurchases)}</InlineBanner>
        ) : null}
      </div>
    );
  }

  if (me.isError || allowance.isError || !allowance.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        {!online ? <InlineBanner>You&apos;re offline.</InlineBanner> : null}
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

  const spendingBelowZero = data.spendingBalanceCents < 0;
  const firstRun = !data.hasPurchaseHistory;
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
        {typeLabel ? (
          <p className="text-[15px] text-[var(--orbit-secondary)]">{typeLabel}</p>
        ) : null}
      </Link>

      <div className="mt-6 space-y-4">
        {!online ? (
          <InlineBanner>You&apos;re offline. Today&apos;s number is from earlier.</InlineBanner>
        ) : null}

        {queuedPurchases > 0 ? (
          <InlineBanner>{queuedPurchaseSentence(queuedPurchases)}</InlineBanner>
        ) : null}

        {online && data.forecastStale ? (
          <InlineBanner>Ahead could not refresh. You are seeing the last one.</InlineBanner>
        ) : null}

        {spendingBelowZero ? (
          <InlineBanner tone="short">
            Spending is below zero. Tomorrow&apos;s pace is $0 until payday covers it.
          </InlineBanner>
        ) : null}

        {bannerLabel && bannerDate ? (
          <InlineBanner tone="short" href="/ahead">
            {bannerLabel}
          </InlineBanner>
        ) : null}

        {firstRun ? (
          <InlineBanner>
            {me.data?.canSpend
              ? "This is your first day. Add a purchase and watch the number change."
              : "This is your first day. The number changes when a purchase is added."}
          </InlineBanner>
        ) : null}
      </div>

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
