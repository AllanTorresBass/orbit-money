"use client";

import { useState } from "react";
import { useUpdateFloor } from "@/hooks/use-accounts";
import { useAllowance } from "@/hooks/use-allowance";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { cn, dollarsFromCents } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";

export interface KeepAtLeastSectionProps {
  className?: string;
}

/** Owners and admins only. The parent hides this section for other roles. */
export function KeepAtLeastSection({ className }: KeepAtLeastSectionProps) {
  const allowance = useAllowance();
  const updateFloor = useUpdateFloor();
  const { handleCrudError } = useGlobalErrorHandler();
  const [typed, setTyped] = useState<string | null>(null);

  const current = allowance.data ? dollarsFromCents(allowance.data.keepAtLeastCents) : "";
  const value = typed ?? current;

  function save(): void {
    const floorCents = parseDollarsToCents(value);
    if (floorCents === null) {
      handleCrudError(new Error("Invalid amount"), { action: "save that amount" });
      return;
    }
    updateFloor.mutate(floorCents, { onSuccess: () => setTyped(null) });
  }

  return (
    <section className={cn("mt-10", className)}>
      <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Keep at least</h2>
      <div className="mt-3 flex items-baseline gap-1">
        <span>$</span>
        <input
          value={value}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full min-w-0 border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
          inputMode="decimal"
          aria-label="Keep at least"
        />
      </div>
      <button
        type="button"
        disabled={updateFloor.isPending}
        className="mt-4 text-[17px] text-[var(--orbit-ink)] disabled:opacity-60"
        onClick={save}
      >
        Save
      </button>
    </section>
  );
}
