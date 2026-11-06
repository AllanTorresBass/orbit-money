"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { OrbitMark } from "@/components/brand/orbit-mark";
import { AnimatedMoney } from "@/components/shell/animated-money";
import { InlineBanner } from "@/components/shell/inline-banner";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { FirstEveningBanner } from "@/components/today/first-evening-banner";
import { OrbitRing } from "@/components/today/orbit-ring";
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
import { reportClientLog } from "@/lib/observability/report-client-log";
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

function TodayHeader({
  href,
  name,
  typeLabel,
}: {
  href: string;
  name: string;
  typeLabel: string | null;
}) {
  return (
    <Link
      href={href}
      className="orbit-reveal group flex items-center justify-between gap-4 rounded-2xl py-1"
      style={{ "--i": 0 } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-3">
        <OrbitMark />
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-semibold leading-tight tracking-tight text-[var(--orbit-ink)]">
            {name}
          </h1>
          {typeLabel ? (
            <p className="text-[13px] text-[var(--orbit-secondary)]">{typeLabel}</p>
          ) : null}
        </div>
      </div>
      <ChevronRight
        className="size-5 shrink-0 text-[var(--orbit-secondary)] transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

/** Larger amounts get a smaller numeral so the figure stays inside the ring. */
function heroSizeClass(text: string): string {
  if (text.length <= 7) return "text-[56px]";
  if (text.length <= 9) return "text-[46px]";
  return "text-[38px]";
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
  // With more than one household, the name opens the switcher on You instead of the top.
  const youHref = me.data && me.data.tenants.length > 1 ? "/you#households" : "/you";

  // Created, but the first number has not been worked out yet.
  if (me.data && isApiError(allowance.error) && allowance.error.status === 404) {
    return (
      <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-32 pt-6", className)}>
        <TodayHeader href={youHref} name={me.data.tenantName} typeLabel={typeLabel} />
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
  const heroColor = pastPace ? "text-[var(--orbit-short)]" : "text-[var(--orbit-ink)]";
  const heroText = formatMoney(Math.abs(data.sTodayCents), { alwaysCents: true });
  const ringProgress = pastPace
    ? 1
    : data.sDailyCents > 0
      ? data.sTodayCents / data.sDailyCents
      : data.sTodayCents > 0
        ? 1
        : 0;

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
    <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-32 pt-6", className)}>
      <TodayHeader href={youHref} name={data.tenantName} typeLabel={typeLabel} />

      <div className="mt-6 space-y-3">
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
              onClick={() => {
                discardPoisonPurchases(queueScope);
                reportClientLog(
                  "info",
                  `Dismissed ${poisonPurchases} saved purchase(s) the server turned away`,
                );
              }}
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

      <section
        aria-label="Today's number"
        className="orbit-reveal mt-8"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <OrbitRing progress={ringProgress} tone={pastPace ? "short" : "brand"}>
          <p className="text-[14px] text-[var(--orbit-secondary)]">
            {pastPace ? "Past today's pace" : "You can spend"}
          </p>
          <p
            className={cn(
              "mt-1 font-[family-name:var(--font-orbit-display)] font-semibold leading-none tracking-tight",
              heroSizeClass(heroText),
              heroColor,
            )}
          >
            <AnimatedMoney cents={Math.abs(data.sTodayCents)} alwaysCents />
          </p>
          {!pastPace && !data.breachDate ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--orbit-fine)_14%,transparent)] px-3 py-1 text-[13px] font-medium text-[var(--orbit-fine)]">
              <span className="size-1.5 rounded-full bg-[var(--orbit-fine)]" aria-hidden="true" />
              On pace
            </p>
          ) : null}
        </OrbitRing>
        <p className="mx-auto mt-6 max-w-[18rem] text-balance text-center text-[15px] leading-relaxed text-[var(--orbit-secondary)]">
          {pastPace
            ? `Tomorrow's pace will be ${formatMoney(data.tomorrowBurnCents, { alwaysCents: true })}.`
            : data.nextPayday
              ? `Until payday on ${formatShortDate(data.nextPayday)}.`
              : "Add a payday to see a daily amount."}
        </p>
      </section>

      <div className="orbit-reveal mt-8 space-y-3" style={{ "--i": 2 } as React.CSSProperties}>
        {me.data?.canSpend ? (
          <button type="button" onClick={() => setSheetOpen(true)} className="orbit-btn w-full">
            <Plus className="size-5" strokeWidth={2.25} aria-hidden="true" />
            Add a purchase
          </button>
        ) : null}

        {paydayDue && payday ? (
          <button
            type="button"
            onClick={() => setPaydaySheetOpen(true)}
            className="orbit-btn-quiet w-full"
          >
            Record payday
          </button>
        ) : null}
      </div>

      {showFirstEvening && me.data ? <FirstEveningBanner tenantId={me.data.tenantId} /> : null}

      <PurchaseSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      {paydaySheetOpen && payday ? (
        <RecordPaydaySheet payday={payday} onClose={() => setPaydaySheetOpen(false)} />
      ) : null}
    </div>
  );
}
