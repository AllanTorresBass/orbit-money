import type { EnvelopeState } from "@/types/envelope/envelope.types";

export interface ScheduleDueRow {
  envelopeId: string | null;
  amountCents: number;
  nextDueDate: string;
  direction: "inflow" | "outflow";
  isActive?: boolean;
}

/**
 * DueAmount_j for fixed envelopes in [today, nextInflow) (D3).
 * When no schedule sum in the window, fall back to target_cap.
 */
export function buildDueAmountByEnvelopeId(input: {
  envelopes: EnvelopeState[];
  schedules: ScheduleDueRow[];
  today: string;
  nextInflow: string | null;
}): Record<string, number> {
  const { today, nextInflow } = input;
  const dueAmountByEnvelopeId: Record<string, number> = {};

  for (const e of input.envelopes.filter((x) => x.tierCategory === "fixed")) {
    let scheduleDue = 0;
    for (const s of input.schedules) {
      if (s.direction !== "outflow") continue;
      if (s.isActive === false) continue;
      if (s.envelopeId !== e.id) continue;
      if (s.nextDueDate < today) continue;
      if (nextInflow !== null && s.nextDueDate >= nextInflow) continue;
      scheduleDue += s.amountCents;
    }
    dueAmountByEnvelopeId[e.id] = scheduleDue > 0 ? scheduleDue : (e.targetCapCents ?? 0);
  }

  return dueAmountByEnvelopeId;
}
