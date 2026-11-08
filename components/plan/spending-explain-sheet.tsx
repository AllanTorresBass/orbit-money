"use client";

import { useLocale, useTranslations } from "next-intl";
import { OrbitSheet } from "@/components/shell/orbit-sheet";
import { formatMoney } from "@/lib/utils";
import type { AppLocale } from "@/types/i18n/locale.types";

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
  const locale = useLocale() as AppLocale;
  const t = useTranslations("plan");
  const fmt = (cents: number) => formatMoney(cents, { locale });

  if (!open) return null;

  return (
    <OrbitSheet title={t("spendingTitle")} onClose={onClose} className={className}>
        <p className="mt-2 text-[17px] tabular-nums text-[var(--orbit-ink)]">
          {t("spendingLeft", { amount: fmt(balanceCents) })}
        </p>
        <div className="mt-6 space-y-4 text-[17px] text-[var(--orbit-ink)]">
          <p>{t("spendingP1")}</p>
          <p>{t("spendingP2")}</p>
          <p>{t("spendingP3")}</p>
        </div>
    </OrbitSheet>
  );
}
