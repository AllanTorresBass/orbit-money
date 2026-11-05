import { describe, expect, it } from "vitest";
import { isCycleEndDay } from "@/lib/pipeline/cycle-boundary";
import { sweepDiscretionaryAtCycleEnd } from "@/lib/engines/waterfall";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

describe("isCycleEndDay", () => {
  it("is true when next payday is tomorrow", () => {
    expect(isCycleEndDay("2026-11-17", "2026-11-18")).toBe(true);
  });

  it("is false when payday is further out or missing", () => {
    expect(isCycleEndDay("2026-11-04", "2026-11-18")).toBe(false);
    expect(isCycleEndDay("2026-11-17", null)).toBe(false);
  });
});

describe("sweepDiscretionaryAtCycleEnd", () => {
  it("moves leftover into the designated sinking fund up to the cap (Harbor D)", () => {
    const car: EnvelopeState = {
      id: "car",
      name: "Car insurance",
      tierCategory: "sinking",
      priorityOrder: 1,
      currentBalanceCents: 60_000,
      targetCapCents: 100_000,
      monthlyInstallmentCents: 20_000,
      rolloverPolicy: "accumulate",
      sweepEnvelopeId: null,
    };
    const emergency: EnvelopeState = {
      id: "emergency",
      name: "Emergency",
      tierCategory: "sinking",
      priorityOrder: 3,
      currentBalanceCents: 0,
      targetCapCents: null,
      monthlyInstallmentCents: 0,
      rolloverPolicy: "accumulate",
      sweepEnvelopeId: null,
    };

    const plan = sweepDiscretionaryAtCycleEnd({
      discretionaryBalanceCents: 153_000,
      discretionaryId: "spend",
      sinkingEnvelopes: [car, emergency],
      sweepEnvelopeId: "car",
    });

    expect(plan.moves[0]).toEqual({ envelopeId: "car", amountCents: 40_000 });
    expect(plan.moves[1]?.envelopeId).toBe("emergency");
    expect(plan.moves[1]?.amountCents).toBe(113_000);
    expect(plan.leftoverCents).toBe(0);
    expect(plan.incomplete).toBe(false);
  });
});
