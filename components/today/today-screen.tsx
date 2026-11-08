"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { OrbitMark } from "@/components/brand/orbit-mark";
import { ThemeToggleButton } from "@/components/shell/theme-toggle";
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
import { isAllowanceFromEarlierDay } from "@/lib/utils/allowance-staleness";
import { tenantTypeLabel } from "@/lib/utils/display-labels";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import type { AppLocale } from "@/types/i18n/locale.types";

export interface TodayScreenProps {
  className?: string;
}

/** Shown while offline with something saved on this phone. */
function offlinePurchaseSentence(
  count: number,
  t: (key: "offlinePurchaseOne" | "offlinePurchaseMany") => string,
): string {
  return count === 1 ? t("offlinePurchaseOne") : t("offlinePurchaseMany");
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
    <div
      className="orbit-reveal flex items-center justify-between gap-3"
      style={{ "--i": 0 } as React.CSSProperties}
    >
      <Link href={href} className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-2xl py-1">
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
      <ThemeToggleButton className="shrink-0" />
    </div>
  );
}

/** Larger amounts get a smaller numeral so the figure stays inside the ring. */
function heroSizeClass(text: string): string {
  if (text.length <= 7) return "text-[56px]";
  if (text.length <= 9) return "text-[46px]";
  return "text-[38px]";
}

export function TodayScreen({ className }: TodayScreenProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const fmt = (cents: number, alwaysCents?: boolean) =>
    formatMoney(cents, { locale, ...(alwaysCents ? { alwaysCents: true } : {}) });

  const me = useMe();
  const allowance = useAllowance();
  const online = useOnlineStatus();
  const plan = usePlan();
  const queueScope = me.data ? { tenantId: me.data.tenantId, userId: me.data.userId } : null;
  const queuedPurchases = useQueuedPurchaseCount(queueScope);
  const poisonPurchases = usePoisonPurchaseCount(queueScope);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paydaySheetOpen, setPaydaySheetOpen] = useState(false);

  const fetchCopy = {
    chooseHousehold: tErrors("chooseHousehold"),
    signIn: tErrors("signIn"),
    cannotSee: tErrors("cannotSee"),
    offline: tErrors("offline"),
    couldNotLoad: tErrors("couldNotLoad"),
  };

  if (me.isLoading || allowance.isLoading) {
    return <TodaySkeleton className={className} />;
  }

  const selectionError = [me.error, allowance.error].find(
    (error) => isApiError(error) && error.code === "tenant_selection_required",
  );
  if (isApiError(selectionError)) {
    return <TenantPicker tenants={selectionError.tenants} className={className} />;
  }

  const typeLabel = me.data ? tenantTypeLabel(me.data.tenantType, t) : null;
  const youHref = me.data && me.data.tenants.length > 1 ? "/you#households" : "/you";

  if (me.data && isApiError(allowance.error) && allowance.error.status === 404) {
    return (
      <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-32 pt-6", className)}>
        <TodayHeader href={youHref} name={me.data.tenantName} typeLabel={typeLabel} />
        <InlineBanner className="mt-6">{t("firstDayWorking")}</InlineBanner>
        {queuedPurchases > 0 ? (
          <InlineBanner className="mt-4">
            {queuedPurchases === 1
              ? t("queuedOne")
              : t("queuedMany", { count: queuedPurchases })}
          </InlineBanner>
        ) : null}
      </div>
    );
  }

  if (me.isError || allowance.isError || !allowance.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        {!online ? <InlineBanner>{tErrors("offline")}</InlineBanner> : null}
        <p className="mt-4 text-[var(--orbit-short)]">
          {fetchErrorMessage(allowance.error ?? me.error, tErrors("resource.today"), fetchCopy)}
        </p>
      </div>
    );
  }

  const data = allowance.data;
  const pastPace = data.sTodayCents < 0;
  const heroColor = pastPace ? "text-[var(--orbit-short)]" : "text-[var(--orbit-ink)]";
  const heroText = fmt(Math.abs(data.sTodayCents), true);
  const ringProgress = pastPace
    ? 1
    : data.sDailyCents > 0
      ? data.sTodayCents / data.sDailyCents
      : data.sTodayCents > 0
        ? 1
        : 0;

  const canConfigure = me.data?.role === "owner" || me.data?.role === "admin";
  const payday = plan.data?.payday ?? null;
  const paydayDue = canConfigure && payday !== null && payday.date <= data.asOfDate;
  const showFirstEvening = canConfigure && plan.data !== undefined && plan.data.bills.length === 0;

  const earlierDay = isAllowanceFromEarlierDay(data.asOfDate, me.data?.timezone);
  const spendingBelowZero = data.spendingBalanceCents < 0;
  const firstRun = !data.hasPurchaseHistory;
  const bannerDate = data.breachDate ?? data.warningDate;
  const keepAtLeast = fmt(data.keepAtLeastCents);
  const bannerLabel = data.breachDate
    ? t("breach", {
        date: formatShortDate(data.breachDate, locale),
        amount: keepAtLeast,
      })
    : data.warningDate
      ? t("warning", { date: formatShortDate(data.warningDate, locale) })
      : null;

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-32 pt-6", className)}>
      <TodayHeader href={youHref} name={data.tenantName} typeLabel={typeLabel} />

      <div className="mt-6 space-y-3">
        {!online ? (
          <InlineBanner>
            {queuedPurchases > 0 ? offlinePurchaseSentence(queuedPurchases, t) : t("offlineStale")}
          </InlineBanner>
        ) : queuedPurchases > 0 ? (
          <InlineBanner>
            {queuedPurchases === 1
              ? t("queuedOne")
              : t("queuedMany", { count: queuedPurchases })}
          </InlineBanner>
        ) : null}

        {poisonPurchases > 0 && queueScope ? (
          <div className="flex items-start justify-between gap-3">
            <InlineBanner tone="short" className="flex-1">
              {poisonPurchases === 1
                ? t("poisonOne")
                : t("poisonMany", { count: poisonPurchases })}
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
              {tCommon("dismiss")}
            </button>
          </div>
        ) : null}

        {earlierDay ? <InlineBanner>{t("staleNumbers")}</InlineBanner> : null}

        {online && data.forecastStale ? <InlineBanner>{t("forecastStale")}</InlineBanner> : null}

        {spendingBelowZero ? (
          <InlineBanner tone="short">{t("spendingBelowZero")}</InlineBanner>
        ) : null}

        {bannerLabel && bannerDate ? (
          <InlineBanner tone="short" href={`/ahead?date=${bannerDate}`}>
            {bannerLabel}
          </InlineBanner>
        ) : null}

        {firstRun ? (
          <InlineBanner>
            {me.data?.canSpend ? t("firstRunCanSpend") : t("firstRunViewOnly")}
          </InlineBanner>
        ) : null}
      </div>

      <section
        aria-label={t("heroAria")}
        className="orbit-reveal mt-8"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <OrbitRing progress={ringProgress} tone={pastPace ? "short" : "brand"}>
          <p className="text-[14px] text-[var(--orbit-secondary)]">
            {pastPace ? t("pastPace") : t("canSpend")}
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
              {tCommon("onPace")}
            </p>
          ) : null}
        </OrbitRing>
        <p className="mx-auto mt-6 max-w-[18rem] text-balance text-center text-[15px] leading-relaxed text-[var(--orbit-secondary)]">
          {pastPace
            ? t("tomorrowPace", { amount: fmt(data.tomorrowBurnCents, true) })
            : data.nextPayday
              ? t("untilPayday", { date: formatShortDate(data.nextPayday, locale) })
              : t("addPayday")}
        </p>
      </section>

      <div className="orbit-reveal mt-8 space-y-3" style={{ "--i": 2 } as React.CSSProperties}>
        {me.data?.canSpend ? (
          <button type="button" onClick={() => setSheetOpen(true)} className="orbit-btn w-full">
            <Plus className="size-5" strokeWidth={2.25} aria-hidden="true" />
            {t("addPurchase")}
          </button>
        ) : null}

        {paydayDue && payday ? (
          <button
            type="button"
            onClick={() => setPaydaySheetOpen(true)}
            className="orbit-btn-quiet w-full"
          >
            {t("recordPayday")}
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
