import { describe, expect, it } from "vitest";
import { splitDailyRate } from "@/lib/money/cents";

describe("splitDailyRate", () => {
  it("floors daily rate and returns leftover cents to today (Harbor $1570/14)", () => {
    const { daily, remainder } = splitDailyRate(157_000, 14);
    expect(daily).toBe(11_214);
    expect(remainder).toBe(4);
    expect(daily + remainder).toBe(11_218);
    expect(14 * daily + remainder).toBe(157_000);
  });
});
