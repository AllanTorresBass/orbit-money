"use client";

import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { formatMoney } from "@/lib/utils";

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
    <OrbitSheet title="Spending" onClose={onClose} className={className}>
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
    </OrbitSheet>
  );
}
