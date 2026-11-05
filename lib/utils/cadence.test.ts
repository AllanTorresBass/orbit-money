import { describe, expect, it } from "vitest";
import { firstOccurrenceOnOrAfter } from "@/lib/calendar/next-occurrence";
import { rrulesForCadence } from "@/lib/utils/cadence";

describe("rrulesForCadence", () => {
  it("creates two monthly rules for twice a month with the chosen days", () => {
    expect(rrulesForCadence("Twice a month", { firstDay: 15, secondDay: 1 })).toEqual([
      "FREQ=MONTHLY;BYMONTHDAY=1",
      "FREQ=MONTHLY;BYMONTHDAY=15",
    ]);
  });

  it("uses BYMONTHDAY=-1 for the last day and keeps it second", () => {
    expect(rrulesForCadence("Twice a month", { firstDay: -1, secondDay: 15 })).toEqual([
      "FREQ=MONTHLY;BYMONTHDAY=15",
      "FREQ=MONTHLY;BYMONTHDAY=-1",
    ]);
    expect(
      rrulesForCadence("Every month", { firstDay: 1, secondDay: 15, monthDay: -1 }),
    ).toEqual(["FREQ=MONTHLY;BYMONTHDAY=-1"]);
  });

  it("reads the last-day rule as the last day of each month", () => {
    const [rule] = rrulesForCadence("Every month", { firstDay: 1, secondDay: 15, monthDay: -1 });
    expect(firstOccurrenceOnOrAfter(rule, "2027-02-10")).toBe("2027-02-28");
    expect(firstOccurrenceOnOrAfter(rule, "2028-02-10")).toBe("2028-02-29");
  });

  it("creates a single rule for every other cadence", () => {
    const days = { firstDay: 1, secondDay: 15 };
    expect(rrulesForCadence("Every week", days)).toHaveLength(1);
    expect(rrulesForCadence("Every two weeks", days)).toEqual(["FREQ=WEEKLY;INTERVAL=2"]);
    expect(rrulesForCadence("Every month", days)).toEqual(["FREQ=MONTHLY;BYMONTHDAY=1"]);
    expect(rrulesForCadence("Once a year", days)).toEqual(["FREQ=YEARLY"]);
  });
});
