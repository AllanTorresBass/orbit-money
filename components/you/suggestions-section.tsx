"use client";

import { useLocale, useTranslations } from "next-intl";
import { useProposals, useResolveProposal } from "@/hooks/use-plan-mutations";
import { cn, formatMoney } from "@/lib/utils";

export interface SuggestionsSectionProps {
  /** Only owners and admins read suggestions. */
  canManage: boolean;
  className?: string;
}

export function SuggestionsSection({ canManage, className }: SuggestionsSectionProps) {
  const locale = useLocale();
  const proposals = useProposals(canManage);
  const resolve = useResolveProposal();
  const t = useTranslations("you");
  const tCommon = useTranslations("common");
  const fmt = (cents: number) => formatMoney(cents, { locale });

  const list = proposals.data?.proposals ?? [];
  if (!canManage || list.length === 0) {
    return null;
  }

  const heading =
    list.length === 1
      ? t("suggestionsOne", { count: list.length })
      : t("suggestionsMany", { count: list.length });

  return (
    <section className={cn("mt-10", className)}>
      <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">{heading}</h2>
      <ul className="mt-2 space-y-4">
        {list.map((p) => {
          const detail =
            p.payload.name +
            (p.payload.targetCapCents !== null ? ` ${fmt(p.payload.targetCapCents)}` : "");
          return (
            <li key={p.id} className="border-b border-[var(--orbit-line)] pb-3">
              <p className="text-[17px] text-[var(--orbit-ink)]">
                {t("suggestionLine", { name: p.proposedByName, detail })}
              </p>
              <div className="mt-2 flex gap-4">
                <button
                  type="button"
                  disabled={resolve.isPending}
                  className="text-[15px] text-[var(--orbit-ink)] disabled:opacity-60"
                  onClick={() => resolve.mutate({ id: p.id, decision: "accepted" })}
                >
                  {tCommon("accept")}
                </button>
                <button
                  type="button"
                  disabled={resolve.isPending}
                  className="text-[15px] text-[var(--orbit-secondary)] disabled:opacity-60"
                  onClick={() => resolve.mutate({ id: p.id, decision: "rejected" })}
                >
                  {tCommon("decline")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
