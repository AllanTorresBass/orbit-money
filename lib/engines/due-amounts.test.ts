import { describe, expect, it } from "vitest";
import { buildDueAmountByEnvelopeId } from "@/lib/engines/due-amounts";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

describe("buildDueAmountByEnvelopeId", () => {
  const rent: EnvelopeState = {
    id: "rent",
    name: "Rent",
    tierCategory: "fixed",
    priorityOrder: 1,
    currentBalanceCents: 0,
    targetCapCents: 200_000,
    monthlyInstallmentCents: null,
    rolloverPolicy: "top_up",
    sweepEnvelopeId: null,
  };

  it("bounds dues to [today, nextInflow)", () => {
    const dues = buildDueAmountByEnvelopeId({
      envelopes: [rent],
      schedules: [
        {
          envelopeId: "rent",
          amountCents: 180_000,
          nextDueDate: "2026-11-10",
          direction: "outflow",
        },
        {
          envelopeId: "rent",
          amountCents: 180_000,
          nextDueDate: "2026-12-10",
          direction: "outflow",
        },
      ],
      today: "2026-11-04",
      nextInflow: "2026-11-18",
    });
    expect(dues.rent).toBe(180_000);
  });

  it("falls back to target_cap when no schedule in window", () => {
    const dues = buildDueAmountByEnvelopeId({
      envelopes: [rent],
      schedules: [],
      today: "2026-11-04",
      nextInflow: "2026-11-18",
    });
    expect(dues.rent).toBe(200_000);
  });
});
