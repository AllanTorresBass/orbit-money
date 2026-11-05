import { describe, expect, it } from "vitest";
import { buildProjectedBurnByDate } from "@/lib/engines/projected-burn";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

const envelopes: EnvelopeState[] = [
  {
    id: "rent",
    name: "Rent",
    tierCategory: "fixed",
    priorityOrder: 1,
    currentBalanceCents: 0,
    targetCapCents: 150_000,
    monthlyInstallmentCents: null,
    rolloverPolicy: "top_up",
    sweepEnvelopeId: null,
  },
  {
    id: "disc",
    name: "Spending",
    tierCategory: "discretionary",
    priorityOrder: 1,
    currentBalanceCents: 10_000,
    targetCapCents: null,
    monthlyInstallmentCents: null,
    rolloverPolicy: "reset_sweep",
    sweepEnvelopeId: null,
  },
];

describe("buildProjectedBurnByDate", () => {
  it("keeps initial burn until a future payday, then rebases from waterfall residual", () => {
    const burnByDate = buildProjectedBurnByDate({
      today: "2026-03-01",
      dates: ["2026-03-01", "2026-03-02", "2026-03-15", "2026-03-16", "2026-03-29"],
      initialBurnCents: 500,
      envelopes,
      dueAmountByEnvelopeId: { rent: 150_000 },
      eventsByDate: {
        "2026-03-15": { inflowCents: 200_000, outflowCents: 0 },
      },
      paydayDates: ["2026-03-15", "2026-03-29"],
    });

    expect(burnByDate["2026-03-01"]).toBe(0);
    expect(burnByDate["2026-03-02"]).toBe(500);
    // Day 03-02 burns 500 → disc 9500; payday residual 50000 → disc 59500;
    // N_p to 03-29 = 14 → floor(59500/14)=4250
    expect(burnByDate["2026-03-15"]).toBe(4250);
    expect(burnByDate["2026-03-16"]).toBe(4250);
  });

  it("clamps post-payday burn by per-cycle O_unfunded", () => {
    const burnByDate = buildProjectedBurnByDate({
      today: "2026-03-01",
      dates: ["2026-03-01", "2026-03-02", "2026-03-15", "2026-03-16"],
      initialBurnCents: 500,
      envelopes,
      dueAmountByEnvelopeId: { rent: 150_000 },
      schedules: [
        {
          envelopeId: "rent",
          amountCents: 150_000,
          nextDueDate: "2026-03-20",
          direction: "outflow",
        },
        {
          envelopeId: null,
          amountCents: 14_000,
          nextDueDate: "2026-03-22",
          direction: "outflow",
        },
      ],
      eventsByDate: {
        "2026-03-15": { inflowCents: 200_000, outflowCents: 0 },
      },
      paydayDates: ["2026-03-15", "2026-03-29"],
    });

    // Residual disc 59500 − O_unfunded 14000 = 45500; floor(45500/14)=3250
    expect(burnByDate["2026-03-15"]).toBe(3_250);
  });
});
