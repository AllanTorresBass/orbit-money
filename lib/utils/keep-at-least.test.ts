import { describe, expect, it } from "vitest";
import { GUIDE_FLOOR_CENTS, weekOfSpendingCents } from "@/lib/utils/keep-at-least";

describe("keep at least guides", () => {
  it("rounds seven days of pace to the dollar", () => {
    expect(weekOfSpendingCents(11_214)).toBe(78_500);
    expect(weekOfSpendingCents(1_234)).toBe(8_600);
  });

  it("offers nothing when there is no pace", () => {
    expect(weekOfSpendingCents(0)).toBe(0);
    expect(weekOfSpendingCents(-500)).toBe(0);
  });

  it("keeps the guide example at $200", () => {
    expect(GUIDE_FLOOR_CENTS).toBe(20_000);
  });
});
