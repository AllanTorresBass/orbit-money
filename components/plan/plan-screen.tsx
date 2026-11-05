"use client";

import { useState } from "react";
import { AddEnvelopeSheet } from "@/components/plan/add-envelope-sheet";
import { EditEnvelopeSheet } from "@/components/plan/edit-envelope-sheet";
import { useMe, usePlan } from "@/hooks/use-allowance";
import { cn, formatMoney } from "@/lib/utils";

export interface PlanScreenProps {
  className?: string;
}

type EditableEnvelope = {
  id: string;
  name: string;
  tierCategory: "fixed" | "sinking";
  balanceCents: number;
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
};

export function PlanScreen({ className }: PlanScreenProps) {
  const plan = usePlan();
  const me = useMe();
  const [addKind, setAddKind] = useState<"fixed" | "sinking" | null>(null);
  const [editing, setEditing] = useState<EditableEnvelope | null>(null);

  const canConfigure = me.data?.role === "owner" || me.data?.role === "admin";
  const canSuggest = me.data?.role === "member";
  const canOpenRow = canConfigure || canSuggest;
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
            <li key={b.id}>
              <button
                type="button"
                disabled={!canOpenRow}
                onClick={() =>
                  setEditing({
                    id: b.id,
                    name: b.name,
                    tierCategory: "fixed",
                    balanceCents: b.balanceCents,
                    targetCapCents: b.targetCapCents,
                    monthlyInstallmentCents: b.monthlyInstallmentCents,
                  })
                }
                className="flex w-full justify-between border-b border-[var(--orbit-line)] py-3 text-left text-[17px] disabled:cursor-default"
              >
                <span>{b.name}</span>
                <span className="tabular-nums">{formatMoney(b.balanceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
        {showAdd ? (
          <button
            type="button"
            className="mt-3 text-[15px] text-[var(--orbit-ink)]"
            onClick={() => setAddKind("fixed")}
          >
            {canSuggest ? "Suggest a bill" : "Add a bill"}
          </button>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">Goals</h2>
        <ul className="mt-2">
          {goals.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                disabled={!canOpenRow}
                onClick={() =>
                  setEditing({
                    id: g.id,
                    name: g.name,
                    tierCategory: "sinking",
                    balanceCents: g.balanceCents,
                    targetCapCents: g.targetCapCents,
                    monthlyInstallmentCents: g.monthlyInstallmentCents,
                  })
                }
                className="flex w-full justify-between border-b border-[var(--orbit-line)] py-3 text-left text-[17px] disabled:cursor-default"
              >
                <span>{g.name}</span>
                <span className="tabular-nums text-[var(--orbit-secondary)]">
                  {formatMoney(g.balanceCents)}
                  {g.targetCapCents !== null ? ` / ${formatMoney(g.targetCapCents)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {showAdd ? (
          <button
            type="button"
            className="mt-3 text-[15px] text-[var(--orbit-ink)]"
            onClick={() => setAddKind("sinking")}
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

      {addKind ? (
        <AddEnvelopeSheet
          open
          kind={addKind}
          mode={canSuggest ? "suggest" : "save"}
          onClose={() => setAddKind(null)}
        />
      ) : null}

      {editing ? (
        <EditEnvelopeSheet
          open
          envelope={editing}
          mode={canSuggest ? "suggest" : "save"}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
