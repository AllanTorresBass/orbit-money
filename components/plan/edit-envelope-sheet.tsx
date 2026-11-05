"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface EditEnvelopeSheetProps {
  open: boolean;
  mode: "save" | "suggest";
  envelope: {
    id: string;
    name: string;
    tierCategory: "fixed" | "sinking";
    balanceCents: number;
    targetCapCents: number | null;
    monthlyInstallmentCents: number | null;
  };
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
  const queryClient = useQueryClient();
  const [name, setName] = useState(envelope.name);
  const [amount, setAmount] = useState("0");
  const [cap, setCap] = useState("");
  const [dueDate, setDueDate] = useState("2026-12-13");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(envelope.name);
    if (envelope.tierCategory === "fixed") {
      setAmount(((envelope.targetCapCents ?? envelope.balanceCents) / 100).toFixed(2));
      setCap(((envelope.targetCapCents ?? envelope.balanceCents) / 100).toFixed(2));
    } else {
      setAmount(((envelope.monthlyInstallmentCents ?? 0) / 100).toFixed(2));
      setCap(envelope.targetCapCents === null ? "" : (envelope.targetCapCents / 100).toFixed(2));
    }
  }, [envelope]);

  if (!open) return null;

  async function submit(): Promise<void> {
    const amountCents = Math.round(Number(amount) * 100);
    const capCents = cap.trim() === "" ? null : Math.round(Number(cap) * 100);
    if (!name.trim() || !Number.isFinite(amountCents) || amountCents < 0) {
      toast.error("Enter a valid name and amount");
      return;
    }
    setSaving(true);
    try {
      const result = await api.updateEnvelope(envelope.id, {
        name: name.trim(),
        tierCategory: envelope.tierCategory,
        targetCapCents:
          envelope.tierCategory === "fixed" ? amountCents : capCents,
        monthlyInstallmentCents:
          envelope.tierCategory === "sinking" ? amountCents : null,
        amountEachPaydayCents:
          envelope.tierCategory === "fixed" ? amountCents : null,
        dueDate: envelope.tierCategory === "fixed" ? dueDate : null,
      });
      if ("proposalId" in result && result.proposalId) {
        toast.success("Someone can review this.");
      } else {
        toast.success("Saved");
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
