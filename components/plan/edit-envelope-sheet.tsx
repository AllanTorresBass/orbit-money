"use client";

import { useState } from "react";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import {
  useMoveEnvelopeToSpending,
  useRemoveEnvelope,
  useUpdateEnvelope,
} from "@/hooks/use-plan-mutations";
import { cn, dollarsFromCents, formatMoney } from "@/lib/utils";
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
  const remove = useRemoveEnvelope(envelope.tierCategory);
  const moveToSpending = useMoveEnvelopeToSpending();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
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

  // A goal that still holds money cannot be removed until that money goes somewhere. A bill
  // with a date is funded from payday, so only a bill with no date can release its balance.
  const canMoveToSpending =
    mode === "save" && envelope.balanceCents > 0 && (!isFixed || envelope.nextDueDate === null);

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
    <div className={cn("orbit-sheet-backdrop", className)}>
      <div className="orbit-sheet">
        <button type="button" onClick={onClose} className="text-[15px] text-[var(--orbit-secondary)]">
          Close
        </button>
        <h2 className="mt-4 font-[family-name:var(--font-orbit-display)] text-[28px] font-semibold tracking-tight text-[var(--orbit-ink)]">
          {envelope.name}
        </h2>
        <label className="mt-6 block text-[15px] text-[var(--orbit-secondary)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full orbit-field"
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
              className="mt-1 block w-full orbit-field"
            />
          </label>
        )}
        <button
          type="button"
          disabled={update.isPending}
          onClick={submit}
          className="mt-8 w-full orbit-btn disabled:opacity-60"
        >
          {mode === "suggest" ? "Suggest this change" : "Save"}
        </button>
        {canMoveToSpending ? (
          <div className="mt-6 text-[15px]">
            <button
              type="button"
              disabled={moveToSpending.isPending}
              className="text-[var(--orbit-ink)] disabled:opacity-60"
              onClick={() => moveToSpending.mutate(envelope.id, { onSuccess: onClose })}
            >
              Move {formatMoney(envelope.balanceCents)} to Spending
            </button>
            <p className="mt-1 text-[13px] text-[var(--orbit-secondary)]">
              Set aside money has to go somewhere before this can be removed.
            </p>
          </div>
        ) : null}
        {mode === "save" ? (
          confirmingRemove ? (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2 text-[15px]">
              <span className="text-[var(--orbit-secondary)]">
                Remove {envelope.name}? Past paydays stay in the record.
              </span>
              <button
                type="button"
                disabled={remove.isPending}
                className="text-[var(--orbit-short)] disabled:opacity-60"
                onClick={() => remove.mutate(envelope.id, { onSuccess: onClose })}
              >
                Remove
              </button>
              <button
                type="button"
                className="text-[var(--orbit-secondary)]"
                onClick={() => setConfirmingRemove(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-4 text-[15px] text-[var(--orbit-secondary)]"
              onClick={() => setConfirmingRemove(true)}
            >
              Remove
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
