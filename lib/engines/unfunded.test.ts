import { describe, expect, it } from "vitest";
import { computeUnfundedCents } from "@/lib/engines/unfunded";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

function fixedEnvelope(partial: Partial<EnvelopeState> & { id: string }): EnvelopeState {
  return {
    name: partial.name ?? "Bill",
    tierCategory: "fixed",
    priorityOrder: partial.priorityOrder ?? 1,
    currentBalanceCents: partial.currentBalanceCents ?? 0,
    targetCapCents: partial.targetCapCents ?? null,
    monthlyInstallmentCents: null,
    rolloverPolicy: "top_up",
    sweepEnvelopeId: null,
    ...partial,
  };
}

describe("computeUnfundedCents", () => {
  it("sums uncovered fixed dues before next inflow (docs/04 $90 example)", () => {
    const rent = fixedEnvelope({ id: "rent", currentBalanceCents: 90_000, priorityOrder: 1 });
    const util = fixedEnvelope({ id: "util", currentBalanceCents: 0, priorityOrder: 2 });
    const unfunded = computeUnfundedCents({
      envelopes: [rent, util],
      schedules: [
        {
          envelopeId: "rent",
          amountCents: 150_000,
          nextDueDate: "2026-11-10",
          direction: "outflow",
        },
        {
          envelopeId: "util",
          amountCents: 30_000,
          nextDueDate: "2026-11-12",
          direction: "outflow",
        },
      ],
      today: "2026-11-04",
      nextInflow: "2026-11-18",
    });
    // rent uncovered 60000 + util 30000 = 90000
    expect(unfunded).toBe(90_000);
  });

  it("counts null envelope_id schedules as fully unfunded", () => {
    const unfunded = computeUnfundedCents({
      envelopes: [],
      schedules: [
        {
          envelopeId: null,
          amountCents: 5_000,
          nextDueDate: "2026-11-05",
          direction: "outflow",
        },
      ],
      today: "2026-11-04",
      nextInflow: "2026-11-18",
    });
    expect(unfunded).toBe(5_000);
  });

  it("ignores dues on or after next inflow", () => {
    const util = fixedEnvelope({ id: "util", currentBalanceCents: 0 });
    const unfunded = computeUnfundedCents({
      envelopes: [util],
      schedules: [
        {
          envelopeId: "util",
          amountCents: 30_000,
          nextDueDate: "2026-11-20",
          direction: "outflow",
        },
      ],
      today: "2026-11-04",
      nextInflow: "2026-11-18",
    });
    expect(unfunded).toBe(0);
  });
});
