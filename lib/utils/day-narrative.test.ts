import { describe, expect, it } from "vitest";
import { dayNarrative } from "@/lib/utils/day-narrative";
import { formatMoney } from "@/lib/utils";

const base = { inflowCents: 0, scheduledOutflowCents: 0, status: "ok", keepAtLeastCents: 20000 } as const;

const tAhead = (key: string, values?: Record<string, string | number>): string => {
  const templates: Record<string, string> = {
    eventBoth: "Payday arrives and bills leave the bank",
    eventInflow: "Payday arrives",
    eventOutflow: "Bills leave the bank",
    eventNone: "Only everyday spending happens",
    narrativeBreach: "{event}, and the bank ends the day below the {amount} you want to keep.",
    narrativeWarning:
      "{event}, and the bank ends the day close to the {amount} you want to keep.",
    narrativeOk: "{event}.",
  };
  let out = templates[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
};

describe("dayNarrative", () => {
  const narrate = (
    day: Parameters<typeof dayNarrative>[0],
  ) => dayNarrative(day, formatMoney, tAhead);

  it("names a bill leaving the bank", () => {
    expect(narrate({ ...base, scheduledOutflowCents: 120000 })).toBe(
      "Bills leave the bank.",
    );
  });

  it("names payday arriving", () => {
    expect(narrate({ ...base, inflowCents: 300000 })).toBe("Payday arrives.");
  });

  it("names both on the same day", () => {
    expect(narrate({ ...base, inflowCents: 1, scheduledOutflowCents: 1 })).toBe(
      "Payday arrives and bills leave the bank.",
    );
  });

  it("falls back to everyday spending", () => {
    expect(narrate(base)).toBe("Only everyday spending happens.");
  });

  it("mentions the amount to keep on a low or short day", () => {
    expect(narrate({ ...base, status: "warning" })).toBe(
      "Only everyday spending happens, and the bank ends the day close to the $200 you want to keep.",
    );
    expect(narrate({ ...base, scheduledOutflowCents: 5, status: "breach" })).toBe(
      "Bills leave the bank, and the bank ends the day below the $200 you want to keep.",
    );
  });
});
