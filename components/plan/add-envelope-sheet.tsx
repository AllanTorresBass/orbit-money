"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface AddEnvelopeSheetProps {
  open: boolean;
  kind: "fixed" | "sinking";
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
  const queryClient = useQueryClient();
  const [name, setName] = useState(kind === "fixed" ? "Rent" : "Vacation");
  const [amount, setAmount] = useState(kind === "fixed" ? "1200" : "100");
  const [cap, setCap] = useState(kind === "fixed" ? "1200" : "1000");
  const [dueDate, setDueDate] = useState("2026-12-13");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function submit(): Promise<void> {
    const amountCents = Math.round(Number(amount) * 100);
    const capCents = Math.round(Number(cap) * 100);
    if (!name.trim() || !Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error("Enter a name and amount");
      return;
    }
    setSaving(true);
    try {
      const result = await api.createEnvelope({
        name: name.trim(),
        tierCategory: kind,
        targetCapCents: Number.isFinite(capCents) ? capCents : null,
        monthlyInstallmentCents: kind === "sinking" ? amountCents : null,
        amountEachPaydayCents: kind === "fixed" ? amountCents : null,
        dueDate: kind === "fixed" ? dueDate : null,
      });
      if ("proposalId" in result && result.proposalId) {
        toast.success("Someone can review this.");
      } else {
        toast.success(kind === "fixed" ? "Bill added" : "Goal added");
      }
      await queryClient.invalidateQueries({ queryKey: ["plan"] });
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
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
          disabled={saving}
          onClick={() => {
            void submit();
          }}
          className="mt-8 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)] disabled:opacity-60"
        >
          {mode === "suggest" ? "Suggest this change" : "Save"}
        </button>
      </div>
    </div>
  );
}
