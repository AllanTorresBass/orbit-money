import { describe, expect, it } from "vitest";
import { applyQueuedPurchase } from "@/lib/utils/queued-purchase";
import type { AllowanceDto } from "@/types/allowance/allowance.types";

const base: AllowanceDto = {
  sTodayCents: 11_218,
  sDailyCents: 11_214,
  nP: 14,
  nextPayday: "2026-11-18",
  mitigated: false,
  asOfDate: "2026-11-04",
  tenantName: "Harbor",
  breachDate: null,
  warningDate: null,
  bankTotalCents: 500_000,
  keepAtLeastCents: 20_000,
  forecastStale: false,
  spendingBalanceCents: 157_000,
  hasPurchaseHistory: false,
};

describe("applyQueuedPurchase", () => {
  it("moves today's number and Spending by the saved amount", () => {
    const next = applyQueuedPurchase(base, 4_000);
    expect(next.sTodayCents).toBe(7_218);
    expect(next.spendingBalanceCents).toBe(153_000);
    expect(next.hasPurchaseHistory).toBe(true);
    expect(next.sDailyCents).toBe(11_214);
  });

  it("can go past today's pace", () => {
    expect(applyQueuedPurchase(base, 15_000).sTodayCents).toBe(-3_782);
  });
});
