import { describe, expect, it } from "vitest";
import { isSafePaydayRrule } from "@/lib/utils/rrule-guard";

describe("isSafePaydayRrule", () => {
  it("allows weekly and monthly", () => {
    expect(isSafePaydayRrule("FREQ=WEEKLY;BYDAY=WE")).toBe(true);
    expect(isSafePaydayRrule("FREQ=MONTHLY;BYMONTHDAY=1")).toBe(true);
  });

  it("rejects short intervals", () => {
    expect(isSafePaydayRrule("FREQ=SECONDLY")).toBe(false);
    expect(isSafePaydayRrule("FREQ=MINUTELY;INTERVAL=1")).toBe(false);
    expect(isSafePaydayRrule("FREQ=HOURLY")).toBe(false);
  });
});
