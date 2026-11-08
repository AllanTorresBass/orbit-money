"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { useUpdateSchedule } from "@/hooks/use-plan-mutations";
import { dollarsFromCents } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { PlanPaydayDto, UpdateScheduleBody } from "@/types/plan/plan.types";

export interface EditPaydaySheetProps {
  payday: PlanPaydayDto;
  onClose: () => void;
  className?: string;
}

/** Change what the next payday brings or the day it lands. Owner and admin only. */
export function EditPaydaySheet({ payday, onClose, className }: EditPaydaySheetProps) {
  const t = useTranslations("plan");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [dollars, setDollars] = useState(dollarsFromCents(payday.amountCents));
  const [date, setDate] = useState(payday.date);
  const update = useUpdateSchedule();
  const { handleCrudError } = useGlobalErrorHandler();

  function onSave(): void {
    const amountCents = parseDollarsToCents(dollars);
    if (amountCents === null || amountCents <= 0 || date === "") {
      handleCrudError(new Error("Invalid amount"), { action: tErrors("action.savePayday") });
      return;
    }
    const body: UpdateScheduleBody = {};
    if (amountCents !== payday.amountCents) body.amountCents = amountCents;
    if (date !== payday.date) body.nextDueDate = date;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    update.mutate({ id: payday.scheduleId, body }, { onSuccess: onClose });
  }

  return (
    <OrbitSheet title={t("editPaydayTitle")} onClose={onClose} className={className}>
        <label className="mt-6 block text-[15px] text-[var(--orbit-secondary)]">
          {tCommon("amount")}
          <div className="mt-1 flex items-baseline gap-1">
            <span>$</span>
            <input
              inputMode="decimal"
              value={dollars}
              onChange={(e) => setDollars(e.target.value)}
              className="w-full min-w-0 bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
            />
          </div>
        </label>
        <label className="mt-4 block text-[15px] text-[var(--orbit-secondary)]">
          {t("nextPayday")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full orbit-field"
          />
        </label>
        <button
          type="button"
          disabled={update.isPending}
          onClick={onSave}
          className="mt-8 w-full orbit-btn disabled:opacity-60"
        >
          {tCommon("save")}
        </button>
    </OrbitSheet>
  );
}
