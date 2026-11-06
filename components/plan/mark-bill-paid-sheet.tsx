"use client";

import { useState } from "react";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { useRecordOutflow } from "@/hooks/use-transactions";
import { cn, dollarsFromCents, formatShortDate } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { PlanEnvelopeDto } from "@/types/plan/plan.types";

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
  const [dollars, setDollars] = useState(
    dollarsFromCents(bill.dueAmountCents ?? bill.targetCapCents ?? bill.balanceCents),
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const record = useRecordOutflow();
  const { handleCrudError } = useGlobalErrorHandler();

  async function onSave(): Promise<void> {
    const amountCents = parseDollarsToCents(dollars);
    if (amountCents === null || amountCents <= 0) {
      handleCrudError(new Error("Invalid amount"), { action: "record the payment" });
      return;
    }
    try {
      await record.mutateAsync({
        amountCents,
        // A bill taken off payday that still holds money has no schedule: name the envelope.
        ...(bill.scheduleId ? { scheduleId: bill.scheduleId } : { envelopeId: bill.id }),
        idempotencyKey,
        memo: bill.name,
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
          Mark {bill.name} paid
        </h2>
        <p className="mt-2 text-[15px] text-[var(--orbit-secondary)]">
          {bill.nextDueDate ? `Due ${formatShortDate(bill.nextDueDate)}. ` : ""}
          Enter what left the bank.
        </p>
        <div className="mt-8 flex items-baseline gap-1">
          <span className="text-3xl text-[var(--orbit-ink)]">$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-full min-w-0 bg-transparent font-[family-name:var(--font-orbit-display)] text-5xl tabular-nums text-[var(--orbit-ink)] outline-none"
            aria-label="Amount paid"
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
