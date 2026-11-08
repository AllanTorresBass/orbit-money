"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useRecordInflow } from "@/hooks/use-transactions";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { dollarsFromCents, formatShortDate } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { PlanPaydayDto } from "@/types/plan/plan.types";
import type { AppLocale } from "@/types/i18n/locale.types";

export interface RecordPaydaySheetProps {
  payday: PlanPaydayDto;
  onClose: () => void;
  className?: string;
}

/** Confirm the deposit that arrived. Mounted only while open, so each open gets a fresh request id. */
export function RecordPaydaySheet({ payday, onClose, className }: RecordPaydaySheetProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [dollars, setDollars] = useState(dollarsFromCents(payday.amountCents));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const record = useRecordInflow();
  const { handleCrudError } = useGlobalErrorHandler();

  async function onSave(): Promise<void> {
    const amountCents = parseDollarsToCents(dollars);
    if (amountCents === null || amountCents <= 0) {
      handleCrudError(new Error("Invalid amount"), { action: tErrors("action.recordPayday") });
      return;
    }
    try {
      await record.mutateAsync({
        amountCents,
        scheduleId: payday.scheduleId,
        idempotencyKey,
        memo: "Payday",
      });
    } catch {
      return;
    }
    onClose();
  }

  return (
    <OrbitSheet title={t("paydaySheetTitle")} onClose={onClose} className={className}>
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
          {t("paydaySheetBody", { date: formatShortDate(payday.date, locale) })}
        </p>
        <div className="mt-8 flex items-baseline gap-1">
          <span className="text-3xl text-[var(--orbit-ink)]">$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-full min-w-0 bg-transparent font-[family-name:var(--font-orbit-display)] text-5xl tabular-nums text-[var(--orbit-ink)] outline-none"
            aria-label={t("paydayAmountAria")}
          />
        </div>
        <button
          type="button"
          disabled={record.isPending}
          onClick={() => {
            void onSave();
          }}
          className="mt-10 w-full orbit-btn disabled:opacity-60"
        >
          {tCommon("save")}
        </button>
    </OrbitSheet>
  );
}
