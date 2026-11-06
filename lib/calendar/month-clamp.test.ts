import { describe, expect, it } from "vitest";
import {
  byMonthDayFromRrule,
  clampDayInMonth,
  monthEndMonthlyDay,
  monthEndOccurrencesBetween,
  nextClampedMonthlyDate,
} from "@/lib/calendar/month-clamp";

describe("month clamp (D11)", () => {
  it("clamps day 31 into February", () => {
    expect(clampDayInMonth(2026, 2, 31)).toBe("2026-02-28");
    expect(clampDayInMonth(2028, 2, 31)).toBe("2028-02-29");
  });

  it("advances Jan 31 to Feb last day", () => {
    expect(nextClampedMonthlyDate("2026-01-31")).toBe("2026-02-28");
    expect(nextClampedMonthlyDate("2026-01-31", 31)).toBe("2026-02-28");
  });

  it("reads BYMONTHDAY from an rrule", () => {
    expect(byMonthDayFromRrule("FREQ=MONTHLY;BYMONTHDAY=31")).toBe(31);
    expect(byMonthDayFromRrule("FREQ=WEEKLY;BYDAY=MO")).toBeNull();
  });

  it("recognises only plain monthly rules pinned to day 29 or later", () => {
    expect(monthEndMonthlyDay("RRULE:FREQ=MONTHLY;BYMONTHDAY=31")).toBe(31);
    expect(monthEndMonthlyDay("FREQ=MONTHLY;BYMONTHDAY=30")).toBe(30);
    // -1 already means "last day" to rrule, which handles it without skipping a month.
    expect(monthEndMonthlyDay("FREQ=MONTHLY;BYMONTHDAY=-1")).toBeNull();
    expect(monthEndMonthlyDay("FREQ=MONTHLY;BYMONTHDAY=15")).toBeNull();
    expect(monthEndMonthlyDay("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31")).toBeNull();
    expect(monthEndMonthlyDay("FREQ=WEEKLY;BYMONTHDAY=31")).toBeNull();
  });

  it("walks a day-31 rule through every short month without skipping one", () => {
    expect(
      monthEndOccurrencesBetween({
        anchor: "2026-01-31",
        byMonthDay: 31,
        from: "2026-01-01",
        until: "2026-05-31",
      }),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
});
