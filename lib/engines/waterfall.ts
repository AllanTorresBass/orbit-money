import type { AllocationResult, EnvelopeState } from "@/types/envelope/envelope.types";

export interface WaterfallInput {
  inflowCents: number;
  envelopes: EnvelopeState[];
  /** Due amounts for fixed envelopes (schedule sum or target_cap). */
  dueAmountByEnvelopeId: Record<string, number>;
}

export interface WaterfallOutput {
  allocations: AllocationResult[];
  balancesAfter: Record<string, number>;
  remainingCents: number;
}

function sortTier(envelopes: EnvelopeState[], tier: EnvelopeState["tierCategory"]): EnvelopeState[] {
  return envelopes
    .filter((e) => e.tierCategory === tier)
    .sort((a, b) => a.priorityOrder - b.priorityOrder);
}

/** Zero-sum inflow allocation (module 2, D2–D5). */
export function allocateInflow(input: WaterfallInput): WaterfallOutput {
  const { inflowCents, envelopes, dueAmountByEnvelopeId } = input;
  if (inflowCents < 0) {
    throw new Error("Inflow cannot be negative");
  }

  const disc = envelopes.filter((e) => e.tierCategory === "discretionary");
  if (disc.length !== 1) {
    throw new Error("Tenant must have exactly one discretionary envelope");
  }

  let remaining = inflowCents;
  const assigned = new Map<string, number>();
  const balances = new Map<string, number>();
  for (const e of envelopes) {
    assigned.set(e.id, 0);
    balances.set(e.id, e.currentBalanceCents);
  }

  for (const e of sortTier(envelopes, "fixed")) {
    if (remaining <= 0) break;
    const due = dueAmountByEnvelopeId[e.id] ?? e.targetCapCents ?? 0;
    const need = Math.max(0, due - (balances.get(e.id) ?? 0));
    const a = Math.min(remaining, need);
    assigned.set(e.id, a);
    balances.set(e.id, (balances.get(e.id) ?? 0) + a);
    remaining -= a;
  }

  for (const e of sortTier(envelopes, "sinking")) {
    if (remaining <= 0) break;
    const balance = balances.get(e.id) ?? 0;
    const installment = e.monthlyInstallmentCents ?? 0;
    if (installment <= 0) continue;
    const room =
      e.targetCapCents === null ? Number.POSITIVE_INFINITY : Math.max(0, e.targetCapCents - balance);
    const a = Math.min(remaining, installment, room === Number.POSITIVE_INFINITY ? installment : room);
    assigned.set(e.id, a);
    balances.set(e.id, balance + a);
    remaining -= a;
  }

  const discretionary = disc[0];
  assigned.set(discretionary.id, remaining);
  balances.set(
    discretionary.id,
    (balances.get(discretionary.id) ?? 0) + remaining,
  );
  remaining = 0;

  const allocations: AllocationResult[] = [...assigned.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([envelopeId, amountCents]) => ({ envelopeId, amountCents }));

  const sum = allocations.reduce((s, a) => s + a.amountCents, 0);
  if (sum !== inflowCents) {
    throw new Error(`Zero-sum failed: allocated ${sum} of ${inflowCents}`);
  }

  const balancesAfter: Record<string, number> = {};
  for (const [id, bal] of balances) {
    balancesAfter[id] = bal;
  }

  return { allocations, balancesAfter, remainingCents: 0 };
}

export interface AbsorbDebitResult {
  envelopeDeltaCents: number;
  discretionaryDeltaCents: number;
  deficitAllocationCents: number;
}

/** Fixed/sinking stop at zero; unpaid remainder reduces discretionary (D12). */
export function absorbDebit(
  envelopeBalanceCents: number,
  amountCents: number,
  isDiscretionary: boolean,
): AbsorbDebitResult {
  if (amountCents <= 0) {
    throw new Error("Debit amount must be positive");
  }
  if (isDiscretionary) {
    return {
      envelopeDeltaCents: -amountCents,
      discretionaryDeltaCents: -amountCents,
      deficitAllocationCents: 0,
    };
  }
  const fromEnvelope = Math.min(envelopeBalanceCents, amountCents);
  const deficit = amountCents - fromEnvelope;
  return {
    envelopeDeltaCents: -fromEnvelope,
    discretionaryDeltaCents: -deficit,
    deficitAllocationCents: deficit,
  };
}

export interface SweepPlanItem {
  envelopeId: string;
  amountCents: number;
}

/** Cycle-end discretionary sweep into sinking funds (D6). */
export function sweepDiscretionaryAtCycleEnd(input: {
  discretionaryBalanceCents: number;
  discretionaryId: string;
  sinkingEnvelopes: EnvelopeState[];
  sweepEnvelopeId: string | null;
}): { moves: SweepPlanItem[]; leftoverCents: number; incomplete: boolean } {
  let remaining = Math.max(0, input.discretionaryBalanceCents);
  const moves: SweepPlanItem[] = [];
  const ordered: EnvelopeState[] = [];
  const sinks = [...input.sinkingEnvelopes].sort((a, b) => a.priorityOrder - b.priorityOrder);

  if (input.sweepEnvelopeId) {
    const first = sinks.find((s) => s.id === input.sweepEnvelopeId);
    if (first) ordered.push(first);
  }
  for (const s of sinks) {
    if (!ordered.some((o) => o.id === s.id)) ordered.push(s);
  }

  const working = new Map(ordered.map((e) => [e.id, e.currentBalanceCents]));

  for (const e of ordered) {
    if (remaining <= 0) break;
    const balance = working.get(e.id) ?? 0;
    const room =
      e.targetCapCents === null ? remaining : Math.max(0, e.targetCapCents - balance);
    const move = Math.min(remaining, room);
    if (move <= 0) continue;
    moves.push({ envelopeId: e.id, amountCents: move });
    working.set(e.id, balance + move);
    remaining -= move;
  }

  return {
    moves,
    leftoverCents: remaining,
    incomplete: remaining > 0,
  };
}
