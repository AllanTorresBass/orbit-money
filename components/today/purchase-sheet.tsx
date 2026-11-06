"use client";

import { useState } from "react";
import { useCreatePurchase } from "@/hooks/use-allowance";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { cn } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";

export interface PurchaseSheetProps {
  open: boolean;
  onClose: () => void;
  className?: string;
}

export function PurchaseSheet({ open, onClose, className }: PurchaseSheetProps) {
  const [dollars, setDollars] = useState("40");
  const purchase = useCreatePurchase();
  const { handleCrudError } = useGlobalErrorHandler();

  if (!open) return null;

  async function onSave(): Promise<void> {
    const amountCents = parseDollarsToCents(dollars);
    if (amountCents === null || amountCents <= 0) {
      handleCrudError(new Error("Invalid amount"), { action: "save the purchase" });
      return;
    }
    try {
      await purchase.mutateAsync({
        amountCents,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch {
      // The mutation already told the person. Keep the sheet open to retry.
      return;
    }
    onClose();
    setDollars("40");
  }

  return (
    <div className={cn("orbit-sheet-backdrop", className)}>
      <div className="orbit-sheet">
        <button
          type="button"
          onClick={onClose}
          className="text-[15px] text-[var(--orbit-secondary)]"
        >
          Close
        </button>
        <h2 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
          Add a purchase
        </h2>
        <div className="mt-8 flex items-baseline gap-1">
          <span className="text-3xl text-[var(--orbit-ink)]">$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            className="w-full bg-transparent font-[family-name:var(--font-orbit-display)] text-5xl tabular-nums text-[var(--orbit-ink)] outline-none"
            aria-label="Purchase amount"
          />
        </div>
        <button
          type="button"
          disabled={purchase.isPending}
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
