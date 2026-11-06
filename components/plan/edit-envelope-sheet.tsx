"use client";

import { useState } from "react";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { useUpdateEnvelope } from "@/hooks/use-plan-mutations";
import { cn, dollarsFromCents } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { EditableEnvelope } from "@/types/plan/plan.types";

export interface EditEnvelopeSheetProps {
  open: boolean;
  mode: "save" | "suggest";
  envelope: EditableEnvelope;
  onClose: () => void;
  className?: string;
}

export function EditEnvelopeSheet({
  open,
  mode,
  envelope,
  onClose,
  className,
}: EditEnvelopeSheetProps) {
  const update = useUpdateEnvelope();
  const { handleCrudError } = useGlobalErrorHandler();
  const isFixed = envelope.tierCategory === "fixed";
  const [name, setName] = useState(envelope.name);
  const [amount, setAmount] = useState(
    isFixed
      ? dollarsFromCents(envelope.targetCapCents ?? envelope.balanceCents)
      : dollarsFromCents(envelope.monthlyInstallmentCents ?? 0),
  );
  const [cap, setCap] = useState(
    isFixed
      ? dollarsFromCents(envelope.targetCapCents ?? envelope.balanceCents)
      : envelope.targetCapCents === null
        ? ""
        : dollarsFromCents(envelope.targetCapCents),
  );
  // The bill's real due date from Plan. Blank when it has no schedule yet.
  const [dueDate, setDueDate] = useState(envelope.nextDueDate ?? "");

  if (!open) return null;

  function submit(): void {
    const amountCents = parseDollarsToCents(amount);
    const capCents = cap.trim() === "" ? null : parseDollarsToCents(cap);
    if (!name.trim() || amountCents === null || (cap.trim() !== "" && capCents === null)) {
      handleCrudError(new Error("Invalid amount"), { action: "save the change" });
      return;
    }
    update.mutate(
      {
        id: envelope.id,
        body: {
          name: name.trim(),
          tierCategory: envelope.tierCategory,
          targetCapCents: envelope.tierCategory === "fixed" ? amountCents : capCents,
          monthlyInstallmentCents: envelope.tierCategory === "sinking" ? amountCents : null,
          amountEachPaydayCents:
            envelope.tierCategory === "fixed" && amountCents > 0 ? amountCents : null,
          dueDate: envelope.tierCategory === "fixed" && dueDate !== "" ? dueDate : null,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className={cn("fixed inset-0 z-40 flex items-end justify-center bg-black/30", className)}>
      <div className="w-full max-w-md rounded-t-2xl bg-[var(--orbit-paper)] p-6">
        <button type="button" onClick={onClose} className="text-[15px] text-[var(--orbit-secondary)]">
          Close
        </button>
        <h2 className="mt-4 font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
          {envelope.name}
        </h2>
        <label className="mt-6 block text-[15px] text-[var(--orbit-secondary)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
          />
        </label>
        <label className="mt-4 block text-[15px] text-[var(--orbit-secondary)]">
          {envelope.tierCategory === "fixed" ? "Amount each payday" : "Set aside each payday"}
          <div className="mt-1 flex items-baseline gap-1">
            <span>$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent py-2 text-[17px] outline-none"
              inputMode="decimal"
            />
          </div>
        </label>
        {envelope.tierCategory === "sinking" ? (
          <label className="mt-4 block text-[15px] text-[var(--orbit-secondary)]">
            Stop when it reaches
            <div className="mt-1 flex items-baseline gap-1">
              <span>$</span>
              <input
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className="w-full bg-transparent py-2 text-[17px] outline-none"
                inputMode="decimal"
                placeholder="No stop"
              />
            </div>
          </label>
        ) : (
          <label className="mt-4 block text-[15px] text-[var(--orbit-secondary)]">
            Leaves the bank
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] outline-none"
            />
          </label>
        )}
        <button
          type="button"
          disabled={update.isPending}
          onClick={submit}
          className="mt-8 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)] disabled:opacity-60"
        >
          {mode === "suggest" ? "Suggest this change" : "Save"}
        </button>
      </div>
    </div>
  );
}
