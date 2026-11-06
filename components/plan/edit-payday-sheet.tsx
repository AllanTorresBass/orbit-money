"use client";

import { useState } from "react";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { useUpdateSchedule } from "@/hooks/use-plan-mutations";
import { cn, dollarsFromCents } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { PlanPaydayDto, UpdateScheduleBody } from "@/types/plan/plan.types";

export interface EditPaydaySheetProps {
  payday: PlanPaydayDto;
  onClose: () => void;
  className?: string;
}

/** Change what the next payday brings or the day it lands. Owner and admin only. */
export function EditPaydaySheet({ payday, onClose, className }: EditPaydaySheetProps) {
  const [dollars, setDollars] = useState(dollarsFromCents(payday.amountCents));
  const [date, setDate] = useState(payday.date);
  const update = useUpdateSchedule();
  const { handleCrudError } = useGlobalErrorHandler();

  function onSave(): void {
    const amountCents = parseDollarsToCents(dollars);
    if (amountCents === null || amountCents <= 0 || date === "") {
      handleCrudError(new Error("Invalid amount"), { action: "save the payday" });
      return;
    }
    // Send only what changed. The date shown is the day the deposit lands, which can differ
    // from the schedule's own date on a weekend, so an untouched date is never written back.
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
    <div className={cn("fixed inset-0 z-40 flex items-end justify-center bg-black/30", className)}>
      <div className="w-full max-w-md rounded-t-2xl bg-[var(--orbit-paper)] p-6 shadow-lg">
        <button type="button" onClick={onClose} className="text-[15px] text-[var(--orbit-secondary)]">
          Close
        </button>
        <h2 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
          Edit payday
        </h2>
        <label className="mt-6 block text-[15px] text-[var(--orbit-secondary)]">
          Amount
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
          Next payday
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
          />
        </label>
        <button
          type="button"
          disabled={update.isPending}
          onClick={onSave}
          className="mt-8 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)] disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </div>
  );
}
