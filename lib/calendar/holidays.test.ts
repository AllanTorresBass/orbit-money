import { describe, expect, it } from "vitest";
import { getHolidaySet, isNonBusinessDay, normalizeBusinessDay } from "@/lib/calendar/holidays";

describe("getHolidaySet", () => {
  it("includes fixed US holidays", () => {
    const set = getHolidaySet("US", 2026);
    expect(set.has("2026-07-04")).toBe(true);
    expect(set.has("2026-12-25")).toBe(true);
  });

  it("fails closed for unsupported regions", () => {
    expect(() => getHolidaySet("CA", 2026)).toThrow(/Holiday calendar missing/);
  });
});

describe("normalizeBusinessDay", () => {
  it("shifts Saturday outflow to Monday", () => {
    const holidays = getHolidaySet("US", 2026);
    // 2026-11-14 is Saturday
    expect(normalizeBusinessDay("2026-11-14", "outflow", holidays)).toBe("2026-11-16");
  });

  it("shifts Saturday inflow to Friday", () => {
    const holidays = getHolidaySet("US", 2026);
    expect(normalizeBusinessDay("2026-11-14", "inflow", holidays)).toBe("2026-11-13");
  });

  it("recognizes weekends as non-business days", () => {
    expect(isNonBusinessDay("2026-11-14", new Set())).toBe(true);
    expect(isNonBusinessDay("2026-11-16", new Set())).toBe(false);
  });
});
