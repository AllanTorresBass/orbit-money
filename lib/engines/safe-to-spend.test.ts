import { describe, expect, it } from "vitest";
import { computeDailyRate, futureBurnCents } from "@/lib/engines/safe-to-spend";

describe("computeDailyRate", () => {
  it("publishes Harbor opening allowance", () => {
    const rate = computeDailyRate({
      discretionaryBalanceCents: 157_000,
      oUnfundedCents: 0,
      nP: 14,
      eDiscActualCents: 0,
    });
    expect(rate).not.toBeNull();
    expect(rate?.sDailyCents).toBe(11_214);
    expect(rate?.remainderCents).toBe(4);
    expect(rate?.sTodayCents).toBe(11_218);
  });

  it("rebakes future burn after overspend (D7)", () => {
    const after = futureBurnCents({
      sDailyCents: 11_214,
      sTodayCents: -3_782,
      discretionaryBalanceCents: 142_000,
      daysAfterToday: 13,
    });
    expect(after).toBe(10_923);
  });

  it("clamps spendable by O_unfunded (docs/04)", () => {
    const rate = computeDailyRate({
      discretionaryBalanceCents: 60_000,
      oUnfundedCents: 9_000,
      nP: 15,
    });
    expect(rate?.sDailyCents).toBe(3_400);
  });
});
