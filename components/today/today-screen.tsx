"use client";

import Link from "next/link";
import { useState } from "react";
import { InlineBanner } from "@/components/shell/inline-banner";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { FirstEveningBanner } from "@/components/today/first-evening-banner";
import { PurchaseSheet } from "@/components/today/purchase-sheet";
import { RecordPaydaySheet } from "@/components/today/record-payday-sheet";
import { TodaySkeleton } from "@/components/today/today-skeleton";
import { useAllowance, useMe, usePlan } from "@/hooks/use-allowance";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  usePoisonPurchaseCount,
  useQueuedPurchaseCount,
} from "@/hooks/use-queued-purchase-count";
import { isApiError } from "@/lib/api/api-error";
import { discardPoisonPurchases } from "@/lib/offline/purchase-queue";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import { isAllowanceFromEarlierDay, STALE_NUMBERS_SENTENCE } from "@/lib/utils/allowance-staleness";
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

function poisonPurchaseSentence(count: number): string {
  return count === 1
    ? "1 saved purchase could not be sent. Add it again if it still matters."
    : `${count} saved purchases could not be sent. Add them again if they still matter.`;
}

/** Shown while offline with something saved on this phone. */
function offlinePurchaseSentence(count: number): string {
  return count === 1
    ? "You're offline. This purchase will save when you reconnect."
    : "You're offline. These purchases will save when you reconnect.";
}

export function TodayScreen({ className }: TodayScreenProps) {
  const me = useMe();
  const allowance = useAllowance();
  const online = useOnlineStatus();
  const plan = usePlan();
  const queueScope = me.data ? { tenantId: me.data.tenantId, userId: me.data.userId } : null;
  const queuedPurchases = useQueuedPurchaseCount(queueScope);
  const poisonPurchases = usePoisonPurchaseCount(queueScope);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paydaySheetOpen, setPaydaySheetOpen] = useState(false);

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

  // Owners and admins settle paydays. Due today or overdue means the deposit is still to record.
  const canConfigure = me.data?.role === "owner" || me.data?.role === "admin";
  const payday = plan.data?.payday ?? null;
  const paydayDue = canConfigure && payday !== null && payday.date <= data.asOfDate;
  // First evening: no bills yet. The banner is only for people who can add one.
  const showFirstEvening = canConfigure && plan.data !== undefined && plan.data.bills.length === 0;

  const earlierDay = isAllowanceFromEarlierDay(data.asOfDate, me.data?.timezone);
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
          <InlineBanner>
            {queuedPurchases > 0
              ? offlinePurchaseSentence(queuedPurchases)
              : "You're offline. Today's number is from earlier."}
          </InlineBanner>
        ) : queuedPurchases > 0 ? (
          <InlineBanner>{queuedPurchaseSentence(queuedPurchases)}</InlineBanner>
        ) : null}

        {poisonPurchases > 0 && queueScope ? (
          <div className="flex items-start justify-between gap-3">
            <InlineBanner tone="short" className="flex-1">
              {poisonPurchaseSentence(poisonPurchases)}
            </InlineBanner>
            <button
              type="button"
              onClick={() => discardPoisonPurchases(queueScope)}
              className="shrink-0 text-[15px] text-[var(--orbit-secondary)]"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {earlierDay ? <InlineBanner>{STALE_NUMBERS_SENTENCE}</InlineBanner> : null}

        {online && data.forecastStale ? (
          <InlineBanner>Ahead could not refresh. You are seeing the last one.</InlineBanner>
        ) : null}

        {spendingBelowZero ? (
          <InlineBanner tone="short">
            Spending is below zero. Tomorrow&apos;s pace is $0 until payday covers it.
          </InlineBanner>
        ) : null}

        {bannerLabel && bannerDate ? (
          <InlineBanner tone="short" href={`/ahead?date=${bannerDate}`}>
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

      {paydayDue && payday ? (
        <button
          type="button"
          onClick={() => setPaydaySheetOpen(true)}
          className="mt-4 w-full border border-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-ink)]"
        >
          Record payday
        </button>
      ) : null}

      {showFirstEvening && me.data ? <FirstEveningBanner tenantId={me.data.tenantId} /> : null}

      <PurchaseSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      {paydaySheetOpen && payday ? (
        <RecordPaydaySheet payday={payday} onClose={() => setPaydaySheetOpen(false)} />
      ) : null}
    </div>
  );
}
