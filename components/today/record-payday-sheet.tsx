"use client";

import { useState } from "react";
import { useRecordInflow } from "@/hooks/use-transactions";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { cn, dollarsFromCents, formatShortDate } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { PlanPaydayDto } from "@/types/plan/plan.types";

export interface RecordPaydaySheetProps {
  payday: PlanPaydayDto;
  onClose: () => void;
  className?: string;
}

/** Confirm the deposit that arrived. Mounted only while open, so each open gets a fresh request id. */
export function RecordPaydaySheet({ payday, onClose, className }: RecordPaydaySheetProps) {
  const [dollars, setDollars] = useState(dollarsFromCents(payday.amountCents));
  // One id per open sheet: a retry after a dropped connection cannot record the payday twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const record = useRecordInflow();
  const { handleCrudError } = useGlobalErrorHandler();

  async function onSave(): Promise<void> {
    const amountCents = parseDollarsToCents(dollars);
    if (amountCents === null || amountCents <= 0) {
      handleCrudError(new Error("Invalid amount"), { action: "record the payday" });
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
      // The mutation already told the person. Keep the sheet open to retry.
      return;
    }
    onClose();
  }

  return (
    <div className={cn("orbit-sheet-backdrop", className)}>
      <div className="orbit-sheet">
        <button type="button" onClick={onClose} className="text-[15px] text-[var(--orbit-secondary)]">
          Close
        </button>
        <h2 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
          Record payday
        </h2>
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
          Payday was due {formatShortDate(payday.date)}. Enter what arrived.
        </p>
        <div className="mt-8 flex items-baseline gap-1">
          <span className="text-3xl text-[var(--orbit-ink)]">$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-full min-w-0 bg-transparent font-[family-name:var(--font-orbit-display)] text-5xl tabular-nums text-[var(--orbit-ink)] outline-none"
            aria-label="Payday amount"
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
          Save
        </button>
      </div>
    </div>
  );
}
