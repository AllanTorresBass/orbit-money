"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AddEnvelopeSheet } from "@/components/plan/add-envelope-sheet";
import { EditEnvelopeSheet } from "@/components/plan/edit-envelope-sheet";
import { useMe, usePlan } from "@/hooks/use-allowance";
import { api } from "@/lib/api/client";
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

type PlanRow = {
  id: string;
  name: string;
  balanceCents: number;
  targetCapCents: number | null;
  monthlyInstallmentCents: number | null;
};

export function PlanScreen({ className }: PlanScreenProps) {
  const plan = usePlan();
  const me = useMe();
  const queryClient = useQueryClient();
  const [addKind, setAddKind] = useState<"fixed" | "sinking" | null>(null);
  const [editing, setEditing] = useState<EditableEnvelope | null>(null);
  const [reordering, setReordering] = useState(false);

  const canConfigure = me.data?.role === "owner" || me.data?.role === "admin";
  const canSuggest = me.data?.role === "member";
  const canOpenRow = canConfigure || canSuggest;
  const showAdd = canConfigure || canSuggest;

  async function moveRow(
    tierCategory: "fixed" | "sinking",
    rows: PlanRow[],
    index: number,
    direction: -1 | 1,
  ): Promise<void> {
    const next = index + direction;
    if (next < 0 || next >= rows.length || reordering) return;
    const orderedIds = rows.map((r) => r.id);
    const tmp = orderedIds[index];
    orderedIds[index] = orderedIds[next];
    orderedIds[next] = tmp;
    setReordering(true);
    try {
      await api.reorderEnvelopes({ tierCategory, orderedIds });
      toast.success("Priority updated");
      await queryClient.invalidateQueries();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not reorder");
    } finally {
      setReordering(false);
    }
  }

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
          {bills.map((b, index) => (
            <li
              key={b.id}
              className="flex items-center gap-2 border-b border-[var(--orbit-line)]"
            >
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
                className="flex min-w-0 flex-1 justify-between py-3 text-left text-[17px] disabled:cursor-default"
              >
                <span className="truncate">{b.name}</span>
                <span className="ml-3 shrink-0 tabular-nums">{formatMoney(b.balanceCents)}</span>
              </button>
              {canConfigure && bills.length > 1 ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${b.name} up`}
                    disabled={reordering || index === 0}
                    className="px-1 text-[15px] text-[var(--orbit-secondary)] disabled:opacity-30"
                    onClick={() => {
                      void moveRow("fixed", bills, index, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${b.name} down`}
                    disabled={reordering || index === bills.length - 1}
                    className="px-1 text-[15px] text-[var(--orbit-secondary)] disabled:opacity-30"
                    onClick={() => {
                      void moveRow("fixed", bills, index, 1);
                    }}
                  >
                    ↓
                  </button>
                </div>
              ) : null}
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
          {goals.map((g, index) => (
            <li
              key={g.id}
              className="flex items-center gap-2 border-b border-[var(--orbit-line)]"
            >
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
                className="flex min-w-0 flex-1 justify-between py-3 text-left text-[17px] disabled:cursor-default"
              >
                <span className="truncate">{g.name}</span>
                <span className="ml-3 shrink-0 tabular-nums text-[var(--orbit-secondary)]">
                  {formatMoney(g.balanceCents)}
                  {g.targetCapCents !== null ? ` / ${formatMoney(g.targetCapCents)}` : ""}
                </span>
              </button>
              {canConfigure && goals.length > 1 ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${g.name} up`}
                    disabled={reordering || index === 0}
                    className="px-1 text-[15px] text-[var(--orbit-secondary)] disabled:opacity-30"
                    onClick={() => {
                      void moveRow("sinking", goals, index, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${g.name} down`}
                    disabled={reordering || index === goals.length - 1}
                    className="px-1 text-[15px] text-[var(--orbit-secondary)] disabled:opacity-30"
                    onClick={() => {
                      void moveRow("sinking", goals, index, 1);
                    }}
                  >
                    ↓
                  </button>
                </div>
              ) : null}
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
