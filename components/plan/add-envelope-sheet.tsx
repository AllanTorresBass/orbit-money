"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useCreateEnvelope } from "@/hooks/use-plan-mutations";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import { defaultBillDueDate } from "@/lib/utils/default-due-date";
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
  const t = useTranslations("plan");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const create = useCreateEnvelope(kind);
  const { handleCrudError } = useGlobalErrorHandler();
  const [name, setName] = useState(kind === "fixed" ? "Rent" : "Vacation");
  const [amount, setAmount] = useState(kind === "fixed" ? "1200" : "100");
  const [cap, setCap] = useState(kind === "fixed" ? "1200" : "1000");
  const [dueDate, setDueDate] = useState(() => defaultBillDueDate());

  if (!open) return null;

  function submit(): void {
    const amountCents = parseDollarsToCents(amount);
    const capCents = parseDollarsToCents(cap);
    if (!name.trim() || amountCents === null || amountCents <= 0) {
      handleCrudError(new Error("Invalid amount"), {
        action: kind === "fixed" ? tErrors("action.saveBill") : tErrors("action.saveGoal"),
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
    <OrbitSheet
      title={kind === "fixed" ? t("addBillTitle") : t("addGoalTitle")}
      onClose={onClose}
      className={className}
    >
        <label className="mt-6 block text-[15px] text-[var(--orbit-secondary)]">
          {tCommon("name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full orbit-field"
          />
        </label>
        <label className="mt-4 block text-[15px] text-[var(--orbit-secondary)]">
          {kind === "fixed" ? t("amountEachPayday") : t("setAsideEachPayday")}
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
            {t("stopWhen")}
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
            {t("leavesBank")}
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
          disabled={create.isPending}
          onClick={submit}
          className="mt-8 w-full orbit-btn disabled:opacity-60"
        >
          {mode === "suggest" ? t("suggestChange") : tCommon("save")}
        </button>
    </OrbitSheet>
  );
}
