"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { useRecordOutflow } from "@/hooks/use-transactions";
import { dollarsFromCents, formatShortDate } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { PlanEnvelopeDto } from "@/types/plan/plan.types";
import type { AppLocale } from "@/types/i18n/locale.types";

export interface MarkBillPaidSheetProps {
  bill: PlanEnvelopeDto;
  onClose: () => void;
  className?: string;
}

/**
 * Confirm a bill left the bank. Mounted only while open, so each open gets a fresh request id
 * and a retry after a dropped connection cannot record the payment twice.
 */
export function MarkBillPaidSheet({ bill, onClose, className }: MarkBillPaidSheetProps) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("plan");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [dollars, setDollars] = useState(
    dollarsFromCents(bill.dueAmountCents ?? bill.targetCapCents ?? bill.balanceCents),
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const record = useRecordOutflow();
  const { handleCrudError } = useGlobalErrorHandler();

  async function onSave(): Promise<void> {
    const amountCents = parseDollarsToCents(dollars);
    if (amountCents === null || amountCents <= 0) {
      handleCrudError(new Error("Invalid amount"), { action: tErrors("action.recordPayment") });
      return;
    }
    try {
      await record.mutateAsync({
        amountCents,
        ...(bill.scheduleId ? { scheduleId: bill.scheduleId } : { envelopeId: bill.id }),
        idempotencyKey,
        memo: bill.name,
      });
    } catch {
      return;
    }
    onClose();
  }

  return (
    <OrbitSheet title={t("markPaidTitle", { name: bill.name })} onClose={onClose} className={className}>
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
          {bill.nextDueDate
            ? `${t("markPaidDue", { date: formatShortDate(bill.nextDueDate, locale) })} `
            : ""}
          {t("markPaidBody")}
        </p>
        <div className="mt-8 flex items-baseline gap-1">
          <span className="text-3xl text-[var(--orbit-ink)]">$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-full min-w-0 bg-transparent font-[family-name:var(--font-orbit-display)] text-5xl tabular-nums text-[var(--orbit-ink)] outline-none"
            aria-label={t("amountPaidAria")}
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
