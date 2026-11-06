import { describe, expect, it } from "vitest";
import {
  effectiveInflowDate,
  holidaySetForRange,
  loadTenantHolidays,
  matchesScheduledAmount,
  pickNextInflowDate,
} from "@/lib/calendar/inflow-dates";

describe("inflow business-day dates", () => {
  const holidays = holidaySetForRange("US", "2026-11-01", "2026-12-31");

  it("moves a Saturday payday to the Friday before", () => {
    // 2026-11-14 is a Saturday.
    expect(effectiveInflowDate("2026-11-14", holidays)).toBe("2026-11-13");
  });

  it("moves a Sunday payday to the Friday before", () => {
    expect(effectiveInflowDate("2026-11-15", holidays)).toBe("2026-11-13");
  });

  it("moves a holiday payday back past the holiday", () => {
    // Thanksgiving, Thursday 2026-11-26.
    expect(effectiveInflowDate("2026-11-26", holidays)).toBe("2026-11-25");
  });

  it("leaves the stored date alone when the region has no calendar", () => {
    expect(effectiveInflowDate("2026-11-14", null)).toBe("2026-11-14");
    expect(loadTenantHolidays("ZZ", "2026-11-06")).toBeNull();
  });

  it("picks the next payday on the business-day calendar", () => {
    expect(pickNextInflowDate(["2026-11-14"], "2026-11-10", holidays)).toBe("2026-11-13");
  });

  it("treats a weekend payday as due today on the Friday before it", () => {
    expect(pickNextInflowDate(["2026-11-14"], "2026-11-13", holidays)).toBe("2026-11-13");
    expect(pickNextInflowDate(["2026-11-14"], "2026-11-14", holidays)).toBeNull();
  });

  it("prefers a later payday over one landing today, and skips overdue ones", () => {
    expect(pickNextInflowDate(["2026-11-10", "2026-11-24"], "2026-11-10", holidays)).toBe(
      "2026-11-24",
    );
    expect(pickNextInflowDate(["2026-11-03"], "2026-11-10", holidays)).toBeNull();
  });

  it("matches a deposit within one cent of the schedule", () => {
    expect(matchesScheduledAmount(300_000, 300_000)).toBe(true);
    expect(matchesScheduledAmount(300_001, 300_000)).toBe(true);
    expect(matchesScheduledAmount(299_999, 300_000)).toBe(true);
    expect(matchesScheduledAmount(300_002, 300_000)).toBe(false);
  });
});
