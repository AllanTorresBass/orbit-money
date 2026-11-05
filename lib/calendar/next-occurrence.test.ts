import { describe, expect, it } from "vitest";
import { firstOccurrenceOnOrAfter } from "@/lib/calendar/next-occurrence";

describe("firstOccurrenceOnOrAfter", () => {
  it("returns the same day when the rule matches it", () => {
    expect(firstOccurrenceOnOrAfter("FREQ=MONTHLY;BYMONTHDAY=15", "2026-11-15")).toBe("2026-11-15");
  });

  it("rolls forward to the next matching day, across a month", () => {
    expect(firstOccurrenceOnOrAfter("FREQ=MONTHLY;BYMONTHDAY=1", "2026-11-18")).toBe("2026-12-01");
    expect(firstOccurrenceOnOrAfter("FREQ=MONTHLY;BYMONTHDAY=15", "2026-11-18")).toBe("2026-12-15");
  });
});
