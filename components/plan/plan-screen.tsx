"use client";

import { useState } from "react";
import { AddEnvelopeSheet } from "@/components/plan/add-envelope-sheet";
import { useMe, usePlan } from "@/hooks/use-allowance";
import { cn, formatMoney } from "@/lib/utils";

export interface PlanScreenProps {
  className?: string;
}

export function PlanScreen({ className }: PlanScreenProps) {
  const plan = usePlan();
  const me = useMe();
  const [sheet, setSheet] = useState<"fixed" | "sinking" | null>(null);

  const canConfigure = me.data?.role === "owner" || me.data?.role === "admin";
  const canSuggest = me.data?.role === "member";
  const showAdd = canConfigure || canSuggest;

  if (plan.isLoading) {
    return (
      <div className={cn("mx-auto max-w-md animate-pulse px-6 pt-8", className)}>
        <div className="h-8 w-28 rounded bg-[var(--orbit-line)]" />
        <div className="mt-8 h-24 w-full rounded bg-[var(--orbit-line)]" />
      </div>
    );
  }

  if (plan.isError || !plan.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        <p className="text-[var(--orbit-short)]">Could not load plan.</p>
      </div>
    );
  }

  const { bills, goals, spending, recentPurchases } = plan.data;

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-6 pb-28 pt-8", className)}>
      <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
        Plan
      </h1>
      <p className="mt-1 text-[15px] text-[var(--orbit-secondary)]">Where payday goes.</p>

      <section className="mt-10">
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Bills</h2>
        <ul className="mt-2">
          {bills.map((b) => (
            <li
              key={b.id}
              className="flex justify-between border-b border-[var(--orbit-line)] py-3 text-[17px]"
            >
              <span>{b.name}</span>
              <span className="tabular-nums">{formatMoney(b.balanceCents)}</span>
            </li>
          ))}
        </ul>
        {showAdd ? (
          <button
            type="button"
            className="mt-3 text-[15px] text-[var(--orbit-ink)]"
            onClick={() => setSheet("fixed")}
          >
            {canSuggest ? "Suggest a bill" : "Add a bill"}
          </button>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Goals</h2>
        <ul className="mt-2">
          {goals.map((g) => (
            <li
              key={g.id}
              className="flex justify-between border-b border-[var(--orbit-line)] py-3 text-[17px]"
            >
              <span>{g.name}</span>
              <span className="tabular-nums text-[var(--orbit-secondary)]">
                {formatMoney(g.balanceCents)}
                {g.targetCapCents !== null ? ` / ${formatMoney(g.targetCapCents)}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {showAdd ? (
          <button
            type="button"
            className="mt-3 text-[15px] text-[var(--orbit-ink)]"
            onClick={() => setSheet("sinking")}
          >
            {canSuggest ? "Suggest a goal" : "Add a goal"}
          </button>
        ) : null}
      </section>

      {spending ? (
        <section className="mt-8">
          <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Spending</h2>
          <p className="mt-2 flex justify-between py-3 text-[17px]">
            <span>{spending.name}</span>
            <span className="tabular-nums">{formatMoney(spending.balanceCents)}</span>
          </p>
          <h3 className="mt-4 text-[13px] text-[var(--orbit-secondary)]">This payday</h3>
          <ul className="mt-1">
            {recentPurchases.length === 0 ? (
              <li className="py-2 text-[15px] text-[var(--orbit-secondary)]">No purchases yet.</li>
            ) : (
              recentPurchases.map((p) => (
                <li
                  key={p.id}
                  className="flex justify-between border-b border-[var(--orbit-line)] py-2 text-[15px]"
                >
                  <span>{p.memo ?? "Purchase"}</span>
                  <span className="tabular-nums">{formatMoney(p.amountCents)}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}

      {sheet ? (
        <AddEnvelopeSheet
          open
          kind={sheet}
          mode={canSuggest ? "suggest" : "save"}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
