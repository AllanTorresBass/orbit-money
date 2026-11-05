"use client";

import { useState } from "react";
import { AddEnvelopeSheet } from "@/components/plan/add-envelope-sheet";
import { EditEnvelopeSheet } from "@/components/plan/edit-envelope-sheet";
import { SpendingExplainSheet } from "@/components/plan/spending-explain-sheet";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { useMe, usePlan } from "@/hooks/use-allowance";
import { useReorderEnvelopes } from "@/hooks/use-plan-mutations";
import { isApiError } from "@/lib/api/api-error";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import type { EditableEnvelope, EditableTier, PlanEnvelopeDto } from "@/types/plan/plan.types";

export interface PlanScreenProps {
  className?: string;
}

export function PlanScreen({ className }: PlanScreenProps) {
  const plan = usePlan();
  const me = useMe();
  const reorder = useReorderEnvelopes();
  const [addKind, setAddKind] = useState<EditableTier | null>(null);
  const [editing, setEditing] = useState<EditableEnvelope | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const reordering = reorder.isPending;

  const canConfigure = me.data?.role === "owner" || me.data?.role === "admin";
  const canSuggest = me.data?.role === "member";
  const canOpenRow = canConfigure || canSuggest;
  const showAdd = canConfigure || canSuggest;

  function moveRow(
    tierCategory: EditableTier,
    rows: PlanEnvelopeDto[],
    index: number,
    direction: -1 | 1,
  ): void {
    const next = index + direction;
    if (next < 0 || next >= rows.length || reordering) return;
    const orderedIds = rows.map((r) => r.id);
    const tmp = orderedIds[index];
    orderedIds[index] = orderedIds[next];
    orderedIds[next] = tmp;
    reorder.mutate({ tierCategory, orderedIds });
  }

  if (plan.isLoading) {
    return (
      <div className={cn("mx-auto max-w-md animate-pulse px-6 pt-8", className)}>
        <div className="h-8 w-28 rounded bg-[var(--orbit-line)]" />
        <div className="mt-8 h-24 w-full rounded bg-[var(--orbit-line)]" />
      </div>
    );
  }

  if (isApiError(plan.error) && plan.error.code === "tenant_selection_required") {
    return <TenantPicker tenants={plan.error.tenants} className={className} />;
  }

  if (plan.isError || !plan.data) {
    return (
      <div className={cn("px-6 pt-10", className)}>
        <p className="text-[var(--orbit-short)]">{fetchErrorMessage(plan.error, "plan")}</p>
      </div>
    );
  }

  const { bills, goals, spending, recentPurchases, payday, sweepIncomplete } = plan.data;

  return (
    <div className={cn("mx-auto min-h-screen max-w-md px-6 pb-28 pt-8", className)}>
      <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
        Plan
      </h1>
      <p className="mt-1 text-[15px] text-[var(--orbit-secondary)]">
        {payday
          ? `Payday ${formatShortDate(payday.date)} · ${formatMoney(payday.amountCents)}`
          : "Where payday goes."}
      </p>

      {sweepIncomplete ? (
        <p
          role="status"
          className="mt-6 border-l-2 border-[var(--orbit-low)] pl-3 text-[15px] text-[var(--orbit-ink)]"
        >
          Some of what was left last payday could not move to your Goals yet.
        </p>
      ) : null}

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
                      moveRow("fixed", bills, index, -1);
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
                      moveRow("fixed", bills, index, 1);
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
                      moveRow("sinking", goals, index, -1);
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
                      moveRow("sinking", goals, index, 1);
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
          <button
            type="button"
            onClick={() => setExplainOpen(true)}
            aria-label="How Spending works"
            className="mt-2 flex w-full justify-between py-3 text-left text-[17px]"
          >
            <span>{spending.name}</span>
            <span className="tabular-nums">{formatMoney(spending.balanceCents)}</span>
          </button>
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

      {spending ? (
        <SpendingExplainSheet
          open={explainOpen}
          onClose={() => setExplainOpen(false)}
          balanceCents={spending.balanceCents}
        />
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
          key={editing.id}
          open
          envelope={editing}
          mode={canSuggest ? "suggest" : "save"}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
