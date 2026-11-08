"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { useGlobalErrorHandler } from "@/hooks/use-global-error-handler";
import {
  useMoveEnvelopeToSpending,
  useRemoveEnvelope,
  useUpdateEnvelope,
} from "@/hooks/use-plan-mutations";
import { dollarsFromCents, formatMoney } from "@/lib/utils";
import { parseDollarsToCents } from "@/lib/utils/money-input";
import type { EditableEnvelope } from "@/types/plan/plan.types";
import type { AppLocale } from "@/types/i18n/locale.types";

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
  const locale = useLocale() as AppLocale;
  const t = useTranslations("plan");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const fmt = (cents: number) => formatMoney(cents, { locale });
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
  const [dueDate, setDueDate] = useState(envelope.nextDueDate ?? "");

  if (!open) return null;

  const canMoveToSpending =
    mode === "save" && envelope.balanceCents > 0 && (!isFixed || envelope.nextDueDate === null);

  function submit(): void {
    const amountCents = parseDollarsToCents(amount);
    const capCents = cap.trim() === "" ? null : parseDollarsToCents(cap);
    if (!name.trim() || amountCents === null || (cap.trim() !== "" && capCents === null)) {
      handleCrudError(new Error("Invalid amount"), { action: tErrors("action.saveChange") });
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
    <OrbitSheet title={envelope.name} onClose={onClose} className={className}>
        <label className="mt-6 block text-[15px] text-[var(--orbit-secondary)]">
          {tCommon("name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full orbit-field"
          />
        </label>
        <label className="mt-4 block text-[15px] text-[var(--orbit-secondary)]">
          {envelope.tierCategory === "fixed" ? t("amountEachPayday") : t("setAsideEachPayday")}
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
            {t("stopWhen")}
            <div className="mt-1 flex items-baseline gap-1">
              <span>$</span>
              <input
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                className="w-full bg-transparent py-2 text-[17px] outline-none"
                inputMode="decimal"
                placeholder={t("noStop")}
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
          disabled={update.isPending}
          onClick={submit}
          className="mt-8 w-full orbit-btn disabled:opacity-60"
        >
          {mode === "suggest" ? t("suggestChange") : tCommon("save")}
        </button>
        {canMoveToSpending ? (
          <div className="mt-6 text-[15px]">
            <button
              type="button"
              disabled={moveToSpending.isPending}
              className="text-[var(--orbit-ink)] disabled:opacity-60"
              onClick={() => moveToSpending.mutate(envelope.id, { onSuccess: onClose })}
            >
              {fmt(envelope.balanceCents)} · {t("moveToSpending")}
            </button>
            <p className="mt-1 text-[13px] text-[var(--orbit-secondary)]">{t("moveToSpendingHint")}</p>
          </div>
        ) : null}
        {mode === "save" ? (
          confirmingRemove ? (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2 text-[15px]">
              <span className="text-[var(--orbit-secondary)]">
                {t("removeConfirm", { name: envelope.name })}
              </span>
              <button
                type="button"
                disabled={remove.isPending}
                className="text-[var(--orbit-short)] disabled:opacity-60"
                onClick={() => remove.mutate(envelope.id, { onSuccess: onClose })}
              >
                {tCommon("remove")}
              </button>
              <button
                type="button"
                className="text-[var(--orbit-secondary)]"
                onClick={() => setConfirmingRemove(false)}
              >
                {tCommon("cancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-4 text-[15px] text-[var(--orbit-secondary)]"
              onClick={() => setConfirmingRemove(true)}
            >
              {tCommon("remove")}
            </button>
          )
        ) : null}
    </OrbitSheet>
  );
}
