import { describe, expect, it } from "vitest";
import { rrulesForCadence } from "@/lib/utils/cadence";

describe("rrulesForCadence", () => {
  it("creates two monthly rules for twice a month with the chosen days", () => {
    expect(rrulesForCadence("Twice a month", { firstDay: 15, secondDay: 1 })).toEqual([
      "FREQ=MONTHLY;BYMONTHDAY=1",
      "FREQ=MONTHLY;BYMONTHDAY=15",
    ]);
  });

  it("creates a single rule for every other cadence", () => {
    const days = { firstDay: 1, secondDay: 15 };
    expect(rrulesForCadence("Every week", days)).toHaveLength(1);
    expect(rrulesForCadence("Every two weeks", days)).toEqual(["FREQ=WEEKLY;INTERVAL=2"]);
    expect(rrulesForCadence("Every month", days)).toEqual(["FREQ=MONTHLY;BYMONTHDAY=1"]);
    expect(rrulesForCadence("Once a year", days)).toEqual(["FREQ=YEARLY"]);
  });
});
