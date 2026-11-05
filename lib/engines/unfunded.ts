import type { EnvelopeState } from "@/types/envelope/envelope.types";
import type { ScheduleDueRow } from "@/lib/engines/due-amounts";

/**
 * O_unfunded — contractual outflows before next inflow that envelopes cannot cover
 * (docs/04-safe-to-spend.md).
 */
export function computeUnfundedCents(input: {
  envelopes: EnvelopeState[];
  schedules: ScheduleDueRow[];
  today: string;
  nextInflow: string | null;
}): number {
  const { today, nextInflow } = input;
  const balanceById = new Map(input.envelopes.map((e) => [e.id, e.currentBalanceCents]));
  const fixedIds = new Set(
    input.envelopes.filter((e) => e.tierCategory === "fixed").map((e) => e.id),
  );

  let unfunded = 0;

  for (const s of input.schedules) {
    if (s.direction !== "outflow") continue;
    if (s.isActive === false) continue;
    if (s.nextDueDate < today) continue;
    if (nextInflow !== null && s.nextDueDate >= nextInflow) continue;

    const isContractual =
      s.envelopeId === null || (s.envelopeId !== null && fixedIds.has(s.envelopeId));
    if (!isContractual) continue;

    if (s.envelopeId === null) {
      unfunded += Math.max(0, s.amountCents);
      continue;
    }

    const balance = balanceById.get(s.envelopeId) ?? 0;
    unfunded += Math.max(0, s.amountCents - balance);
  }

  return unfunded;
}
