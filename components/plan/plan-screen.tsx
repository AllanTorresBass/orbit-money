"use client";

import { useState } from "react";
import { AddEnvelopeSheet } from "@/components/plan/add-envelope-sheet";
import { EditEnvelopeSheet } from "@/components/plan/edit-envelope-sheet";
import { EditPaydaySheet } from "@/components/plan/edit-payday-sheet";
import { MarkBillPaidSheet } from "@/components/plan/mark-bill-paid-sheet";
import { PlanSkeleton } from "@/components/plan/plan-skeleton";
import { SpendingExplainSheet } from "@/components/plan/spending-explain-sheet";
import { InlineBanner } from "@/components/shell/inline-banner";
import { TenantPicker } from "@/components/shell/tenant-picker";
import { useMe, usePlan } from "@/hooks/use-allowance";
import { useProposals, useReorderEnvelopes } from "@/hooks/use-plan-mutations";
import { useVoidTransaction } from "@/hooks/use-transactions";
import { isApiError } from "@/lib/api/api-error";
import { cn, formatMoney, formatShortDate } from "@/lib/utils";
import { billSetAsideLabel } from "@/lib/utils/display-labels";
import { fetchErrorMessage } from "@/lib/utils/handle-fetch-error";
import type { EditableEnvelope, EditableTier, PlanEnvelopeDto } from "@/types/plan/plan.types";

export interface PlanScreenProps {
  className?: string;
}

function setAside(bill: PlanEnvelopeDto) {
  return billSetAsideLabel(bill.balanceCents, bill.targetCapCents, formatMoney);
}

export function PlanScreen({ className }: PlanScreenProps) {
  const plan = usePlan();
  const me = useMe();
  const reorder = useReorderEnvelopes();
  const undo = useVoidTransaction();
  const [addKind, setAddKind] = useState<EditableTier | null>(null);
  const [editing, setEditing] = useState<EditableEnvelope | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [payingBill, setPayingBill] = useState<PlanEnvelopeDto | null>(null);
  const [editingPayday, setEditingPayday] = useState(false);
  const reordering = reorder.isPending;

  const canConfigure = me.data?.role === "owner" || me.data?.role === "admin";
  const canSuggest = me.data?.role === "member";
  // Only owners and admins can read suggestions. A member suggests and never applies.
  const proposals = useProposals(canConfigure);
  const pendingSuggestions = canConfigure ? (proposals.data?.proposals.length ?? 0) : 0;
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
    return <PlanSkeleton className={className} />;
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
    <div className={cn("mx-auto min-h-screen max-w-md px-5 pb-28 pt-8", className)}>
      <h1 className="font-[family-name:var(--font-orbit-display)] text-[32px] font-semibold leading-tight tracking-tight text-[var(--orbit-ink)]">
        Plan
      </h1>
      {payday ? (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-[var(--orbit-brand-soft)] p-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--orbit-brand)]">
              Payday on {formatShortDate(payday.date)}
            </p>
            <p className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight text-[var(--orbit-ink)]">
              {formatMoney(payday.amountCents)}
            </p>
          </div>
          {canConfigure ? (
            <button
              type="button"
              className="orbit-link shrink-0 rounded-full bg-[var(--orbit-surface)] px-4 py-2 text-[14px]"
              onClick={() => setEditingPayday(true)}
            >
              Edit payday
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-[15px] text-[var(--orbit-secondary)]">Where payday goes.</p>
      )}

      {pendingSuggestions > 0 ? (
        <InlineBanner href="/you" className="mt-6">
          {pendingSuggestions === 1
            ? "1 suggestion is waiting for you."
            : `${pendingSuggestions} suggestions are waiting for you.`}
        </InlineBanner>
      ) : null}

      {sweepIncomplete ? (
        <p
          role="status"
          className="mt-6 border-l-2 border-[var(--orbit-low)] pl-3 text-[15px] text-[var(--orbit-ink)]"
        >
          Some of what was left last payday could not move to your Goals yet.
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="orbit-eyebrow">Bills</h2>
        <ul className="orbit-group mt-3">
          {bills.map((b, index) => (
            <li key={b.id} className="flex items-center gap-2 pr-3">
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
                    nextDueDate: b.nextDueDate,
                  })
                }
                className="flex min-w-0 flex-1 items-center justify-between px-4 py-4 text-left text-[17px] disabled:cursor-default"
              >
                <span className="truncate">{b.name}</span>
                <span
                  className={cn(
                    "ml-3 shrink-0 tabular-nums",
                    setAside(b).covered ? "text-[var(--orbit-secondary)]" : "text-[var(--orbit-ink)]",
                  )}
                >
                  {setAside(b).text}
                </span>
              </button>
              {canConfigure && (b.scheduleId || b.balanceCents > 0) ? (
                <button
                  type="button"
                  aria-label={`Mark ${b.name} paid`}
                  className="orbit-link shrink-0 px-1 text-[15px]"
                  onClick={() => setPayingBill(b)}
                >
                  Paid
                </button>
              ) : null}
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
            className="orbit-link mt-4 text-[15px]"
            onClick={() => setAddKind("fixed")}
          >
            {canSuggest ? "Suggest a bill" : "Add a bill"}
          </button>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="orbit-eyebrow">Goals</h2>
        <ul className="orbit-group mt-3">
          {goals.map((g, index) => (
            <li key={g.id} className="flex items-center gap-2 pr-3">
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
                    nextDueDate: null,
                  })
                }
                className="flex min-w-0 flex-1 items-center justify-between px-4 py-4 text-left text-[17px] disabled:cursor-default"
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
            className="orbit-link mt-4 text-[15px]"
            onClick={() => setAddKind("sinking")}
          >
            {canSuggest ? "Suggest a goal" : "Add a goal"}
          </button>
        ) : null}
      </section>

      {spending ? (
        <section className="mt-8">
          <h2 className="orbit-eyebrow">Spending</h2>
          <button
            type="button"
            onClick={() => setExplainOpen(true)}
            aria-label="How Spending works"
            className="orbit-group mt-3 flex w-full items-center justify-between px-4 py-4 text-left text-[17px] transition-colors hover:border-[var(--orbit-brand)]"
          >
            <span>{spending.name}</span>
            <span className="font-semibold tabular-nums">{formatMoney(spending.balanceCents)}</span>
          </button>
          <h3 className="mt-6 text-[13px] font-medium text-[var(--orbit-secondary)]">This payday</h3>
          <ul className="orbit-group mt-2">
            {recentPurchases.length === 0 ? (
              <li className="px-4 py-4 text-[15px] text-[var(--orbit-secondary)]">
                No purchases yet.
              </li>
            ) : (
              recentPurchases.map((p) => (
                <li
                  key={p.id}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 text-[15px]"
                >
                  <span className="min-w-0 truncate">{p.memo ?? "Purchase"}</span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="tabular-nums">{formatMoney(p.amountCents)}</span>
                    {canConfigure ? (
                      <button
                        type="button"
                        aria-label={`Undo ${p.memo ?? "purchase"} ${formatMoney(p.amountCents)}`}
                        disabled={undo.isPending}
                        className="text-[15px] text-[var(--orbit-secondary)] disabled:opacity-60"
                        onClick={() => undo.mutate(p.id)}
                      >
                        Undo
                      </button>
                    ) : null}
                  </span>
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

      {payingBill ? (
        <MarkBillPaidSheet key={payingBill.id} bill={payingBill} onClose={() => setPayingBill(null)} />
      ) : null}

      {editingPayday && payday ? (
        <EditPaydaySheet payday={payday} onClose={() => setEditingPayday(false)} />
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
