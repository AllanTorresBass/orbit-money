import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/calendar/dates";
import { projectCashflow } from "@/lib/engines/forecast";
import { mitigateBreach } from "@/lib/engines/solvency";
import { ceilCents } from "@/lib/money/cents";

describe("mitigateBreach", () => {
  it("cuts discretionary burn for a day-22 floor gap (walkthrough E)", () => {
    const today = "2026-11-04";
    const payday = addDays(today, 23);
    const eventsByDate: Record<string, { inflowCents: number; outflowCents: number }> = {
      [payday]: { inflowCents: 500_000, outflowCents: 0 },
      [addDays(today, 37)]: { inflowCents: 500_000, outflowCents: 0 },
      [addDays(today, 51)]: { inflowCents: 500_000, outflowCents: 0 },
    };
    // C(0)=2350, burn=$100/day → day 22 balance = $150; floor $200 → $50 gap.
    const series = projectCashflow({
      c0Cents: 235_000,
      today,
      addDays,
      eventsByDate,
      burnForDay: (dayOffset) => (dayOffset === 0 ? 0 : 10_000),
      cMinCents: 20_000,
    });

    const day22 = series.find((d) => d.dayOffset === 22);
    expect(day22?.balanceCents).toBe(15_000);
    expect(day22?.status).toBe("breach");

    const result = mitigateBreach({
      series,
      rateCents: 10_000,
      cMinCents: 20_000,
      today,
      addDays,
      eventsByDate,
      c0Cents: 235_000,
    });

    const expectedFirstCut = ceilCents(5_000 / 22);
    expect(expectedFirstCut).toBe(228);
    expect(result.cutsApplied).toBeGreaterThan(0);
    expect(result.rateCents).toBeLessThanOrEqual(10_000 - expectedFirstCut);
  });
});
