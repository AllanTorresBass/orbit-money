import { describe, expect, it } from "vitest";
import { allocateInflow } from "@/lib/engines/waterfall";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

function env(
  partial: Partial<EnvelopeState> & Pick<EnvelopeState, "id" | "name" | "tierCategory" | "priorityOrder">,
): EnvelopeState {
  return {
    currentBalanceCents: 0,
    targetCapCents: null,
    monthlyInstallmentCents: null,
    rolloverPolicy:
      partial.tierCategory === "fixed"
        ? "top_up"
        : partial.tierCategory === "sinking"
          ? "accumulate"
          : "reset_sweep",
    sweepEnvelopeId: null,
    ...partial,
  };
}

describe("allocateInflow", () => {
  it("matches Harbor $3000 paycheck split", () => {
    const envelopes: EnvelopeState[] = [
      env({
        id: "rent",
        name: "Rent",
        tierCategory: "fixed",
        priorityOrder: 1,
        currentBalanceCents: 0,
        targetCapCents: 120_000,
      }),
      env({
        id: "electric",
        name: "Electricity",
        tierCategory: "fixed",
        priorityOrder: 2,
        currentBalanceCents: 4_000,
        targetCapCents: 15_000,
      }),
      env({
        id: "car",
        name: "Car insurance",
        tierCategory: "sinking",
        priorityOrder: 1,
        currentBalanceCents: 40_000,
        targetCapCents: 100_000,
        monthlyInstallmentCents: 20_000,
      }),
      env({
        id: "vacation",
        name: "Vacation",
        tierCategory: "sinking",
        priorityOrder: 2,
        currentBalanceCents: 100_000,
        targetCapCents: 100_000,
        monthlyInstallmentCents: 10_000,
      }),
      env({
        id: "spend",
        name: "Spending",
        tierCategory: "discretionary",
        priorityOrder: 1,
        currentBalanceCents: 8_000,
      }),
    ];

    const result = allocateInflow({
      inflowCents: 300_000,
      envelopes,
      dueAmountByEnvelopeId: {
        rent: 120_000,
        electric: 15_000,
      },
    });

    const byId = Object.fromEntries(result.allocations.map((a) => [a.envelopeId, a.amountCents]));
    expect(byId.rent).toBe(120_000);
    expect(byId.electric).toBe(11_000);
    expect(byId.car).toBe(20_000);
    expect(byId.vacation).toBeUndefined();
    expect(byId.spend).toBe(149_000);
    expect(result.balancesAfter.spend).toBe(157_000);
  });
});
