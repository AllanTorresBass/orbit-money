import { describe, expect, it } from "vitest";
import { dayNarrative } from "@/lib/utils/day-narrative";

const base = { inflowCents: 0, scheduledOutflowCents: 0, status: "ok", keepAtLeastCents: 20000 } as const;

describe("dayNarrative", () => {
  it("names a bill leaving the bank", () => {
    expect(dayNarrative({ ...base, scheduledOutflowCents: 120000 })).toBe(
      "Bills leave the bank.",
    );
  });

  it("names payday arriving", () => {
    expect(dayNarrative({ ...base, inflowCents: 300000 })).toBe("Payday arrives.");
  });

  it("names both on the same day", () => {
    expect(dayNarrative({ ...base, inflowCents: 1, scheduledOutflowCents: 1 })).toBe(
      "Payday arrives and bills leave the bank.",
    );
  });

  it("falls back to everyday spending", () => {
    expect(dayNarrative(base)).toBe("Only everyday spending happens.");
  });

  it("mentions the amount to keep on a low or short day", () => {
    expect(dayNarrative({ ...base, status: "warning" })).toBe(
      "Only everyday spending happens, and the bank ends the day close to the $200 you want to keep.",
    );
    expect(dayNarrative({ ...base, scheduledOutflowCents: 5, status: "breach" })).toBe(
      "Bills leave the bank, and the bank ends the day below the $200 you want to keep.",
    );
  });
});
