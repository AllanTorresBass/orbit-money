import { describe, expect, it } from "vitest";
import { isAllowanceFromEarlierDay } from "@/lib/utils/allowance-staleness";

const NOW = new Date("2026-11-06T03:00:00Z"); // Nov 5 evening in New York, Nov 6 in UTC

describe("isAllowanceFromEarlierDay", () => {
  it("is stale when the snapshot day is before the household's local today", () => {
    expect(isAllowanceFromEarlierDay("2026-11-05", "UTC", NOW)).toBe(true);
  });

  it("uses the household timezone, not the device or UTC", () => {
    expect(isAllowanceFromEarlierDay("2026-11-05", "America/New_York", NOW)).toBe(false);
  });

  it("is not stale for today or a future date", () => {
    expect(isAllowanceFromEarlierDay("2026-11-06", "UTC", NOW)).toBe(false);
    expect(isAllowanceFromEarlierDay("2026-11-07", "UTC", NOW)).toBe(false);
  });

  it("does not judge without a timezone", () => {
    expect(isAllowanceFromEarlierDay("2020-01-01", undefined, NOW)).toBe(false);
  });
});
