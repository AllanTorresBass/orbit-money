"use client";

import { useProposals, useResolveProposal } from "@/hooks/use-plan-mutations";
import { cn, formatMoney } from "@/lib/utils";

export interface SuggestionsSectionProps {
  /** Only owners and admins read suggestions. */
  canManage: boolean;
  className?: string;
}

export function SuggestionsSection({ canManage, className }: SuggestionsSectionProps) {
  const proposals = useProposals(canManage);
  const resolve = useResolveProposal();

  const list = proposals.data?.proposals ?? [];
  if (!canManage || list.length === 0) {
    return null;
  }

  return (
    <section className={cn("mt-10", className)}>
      <h2 className="text-[15px] font-medium text-[var(--orbit-ink)]">
        {list.length} suggestion{list.length === 1 ? "" : "s"}
      </h2>
      <ul className="mt-2 space-y-4">
        {list.map((p) => (
          <li key={p.id} className="border-b border-[var(--orbit-line)] pb-3">
            <p className="text-[17px] text-[var(--orbit-ink)]">
              {p.proposedByName} suggests {p.payload.name}
              {p.payload.targetCapCents !== null ? ` ${formatMoney(p.payload.targetCapCents)}` : ""}
            </p>
            <div className="mt-2 flex gap-4">
              <button
                type="button"
                disabled={resolve.isPending}
                className="text-[15px] text-[var(--orbit-ink)] disabled:opacity-60"
                onClick={() => resolve.mutate({ id: p.id, decision: "accepted" })}
              >
                Accept
              </button>
              <button
                type="button"
                disabled={resolve.isPending}
                className="text-[15px] text-[var(--orbit-secondary)] disabled:opacity-60"
                onClick={() => resolve.mutate({ id: p.id, decision: "rejected" })}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
