"use client";

import { useState } from "react";
import { useCreateEnvelope } from "@/hooks/use-plan-mutations";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { cn } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { EditableTier } from "@/types/plan/plan.types";

export interface AddEnvelopeSheetProps {
  open: boolean;
  kind: EditableTier;
  mode: "save" | "suggest";
  onClose: () => void;
  className?: string;
}

export function AddEnvelopeSheet({
  open,
  kind,
  mode,
  onClose,
  className,
}: AddEnvelopeSheetProps) {
  const create = useCreateEnvelope(kind);
  const { handleCrudError } = useGlobalErrorHandler();
  const [name, setName] = useState(kind === "fixed" ? "Rent" : "Vacation");
  const [amount, setAmount] = useState(kind === "fixed" ? "1200" : "100");
  const [cap, setCap] = useState(kind === "fixed" ? "1200" : "1000");
  const [dueDate, setDueDate] = useState("2026-12-13");

  if (!open) return null;

  function submit(): void {
    const amountCents = parseDollarsToCents(amount);
    const capCents = parseDollarsToCents(cap);
    if (!name.trim() || amountCents === null || amountCents <= 0) {
      handleCrudError(new Error("Invalid amount"), {
        action: kind === "fixed" ? "save the bill" : "save the goal",
      });
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        tierCategory: kind,
        targetCapCents: capCents,
        monthlyInstallmentCents: kind === "sinking" ? amountCents : null,
        amountEachPaydayCents: kind === "fixed" ? amountCents : null,
        dueDate: kind === "fixed" ? dueDate : null,
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
          {kind === "fixed" ? "Add a bill" : "Add a goal"}
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
          {kind === "fixed" ? "Amount each payday" : "Set aside each payday"}
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[var(--orbit-ink)]">$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
              inputMode="decimal"
            />
          </div>
        </label>
        {kind === "sinking" ? (
          <label className="mt-4 block text-[15px] text-[var(--orbit-secondary)]">
            Stop when it reaches
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-[var(--orbit-ink)]">$</span>
              <input
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className="w-full bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
                inputMode="decimal"
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
              className="mt-1 block w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
            />
          </label>
        )}
        <button
          type="button"
          disabled={create.isPending}
          onClick={submit}
          className="mt-8 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)] disabled:opacity-60"
        >
          {mode === "suggest" ? "Suggest this change" : "Save"}
        </button>
      </div>
    </div>
  );
}
