import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/calendar/dates";
import { projectCashflow } from "@/lib/engines/forecast";
import { computeDailyRate, futureBurnCents } from "@/lib/engines/safe-to-spend";

/**
 * Harbor walkthrough A5 / B overspend / C midnight (docs/09) as pure unit checks.
 */
describe("Harbor walkthrough forecast", () => {
  const today = "2026-11-04";
  const rentDate = "2026-11-13";
  const burn = 11_214;

  it("A5: days 0/8/9/13 match the walkthrough bank balances", () => {
    const series = projectCashflow({
      c0Cents: 500_000,
      today,
      addDays,
      eventsByDate: {
        [rentDate]: { inflowCents: 0, outflowCents: 120_000 },
      },
      burnForDay: (dayOffset) => (dayOffset === 0 ? 0 : burn),
      cMinCents: 20_000,
    });

    expect(series.find((d) => d.dayOffset === 0)?.balanceCents).toBe(500_000);
    // Day 8: 5000 - 8*112.14 = 4102.88
    expect(series.find((d) => d.dayOffset === 8)?.balanceCents).toBe(410_288);
    // Day 9: 4102.88 - 112.14 - 1200 = 2790.74
    expect(series.find((d) => d.dayOffset === 9)?.balanceCents).toBe(279_074);
    // Day 13: 2790.74 - 4*112.14 = 2342.18
    expect(series.find((d) => d.dayOffset === 13)?.balanceCents).toBe(234_218);
  });

  it("B overspend: future burn rebakes to 109.23", () => {
    expect(
      futureBurnCents({
        sDailyCents: 11_214,
        sTodayCents: -3_782,
        discretionaryBalanceCents: 142_000,
        daysAfterToday: 13,
      }),
    ).toBe(10_923);
  });

  it("C midnight: S_daily from Spending 1530 / 13 = 117.69", () => {
    const rate = computeDailyRate({
      discretionaryBalanceCents: 153_000,
      oUnfundedCents: 0,
      nP: 13,
    });
    expect(rate?.sDailyCents).toBe(11_769);
  });
});
