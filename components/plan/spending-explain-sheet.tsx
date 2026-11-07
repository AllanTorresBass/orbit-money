"use client";

import { cn, formatMoney } from "@/lib/utils";

export interface SpendingExplainSheetProps {
  open: boolean;
  onClose: () => void;
  /** What is left in Spending right now, in cents. */
  balanceCents: number;
  className?: string;
}

export function SpendingExplainSheet({
  open,
  onClose,
  balanceCents,
  className,
}: SpendingExplainSheetProps) {
  if (!open) return null;

  return (
    <div
      className={cn("orbit-sheet-backdrop", className)}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How Spending works"
        className="orbit-sheet max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="text-[15px] text-[var(--orbit-secondary)]">
          Close
        </button>
        <h2 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
          Spending
        </h2>
        <p className="mt-2 text-[17px] tabular-nums text-[var(--orbit-ink)]">
          {formatMoney(balanceCents)} left this payday
        </p>
        <div className="mt-6 space-y-4 text-[17px] text-[var(--orbit-ink)]">
          <p>Payday goes to Bills first, then Goals. What is left is Spending.</p>
          <p>
            Orbit splits Spending evenly across the days until the next payday. That share is what
            you can spend today.
          </p>
          <p>
            If you spend less, the rest carries to tomorrow. When payday arrives, anything still
            unspent moves to your Goals.
          </p>
        </div>
      </div>
    </div>
  );
}
