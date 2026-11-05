import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { planService } from "@/lib/services/plan/PlanService";
import { transactionService } from "@/lib/services/transactions/TransactionService";

config({ path: ".env" });

describe("RBAC", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it("denies Casey (advisor) from logging a purchase", async () => {
    await expect(
      transactionService.createPurchase({
        tenantId: HARBOR.tenantId,
        userId: HARBOR.caseyId,
        role: "advisor",
        amountCents: 4000,
        idempotencyKey: `casey-denied-${Date.now()}`,
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("lets Blair propose and blocks Blair from accepting their own proposal", async () => {
    const proposed = await planService.createEnvelope({
      tenantId: HARBOR.tenantId,
      userId: HARBOR.blairId,
      role: "member",
      payload: {
        name: "Internet",
        tierCategory: "fixed",
        targetCapCents: 8000,
        monthlyInstallmentCents: null,
        amountEachPaydayCents: 8000,
        dueDate: "2026-11-20",
      },
    });

    expect("proposalId" in proposed).toBe(true);
    if (!("proposalId" in proposed)) return;

    await expect(
      planService.resolveProposal({
        tenantId: HARBOR.tenantId,
        userId: HARBOR.blairId,
        role: "member",
        proposalId: proposed.proposalId,
        decision: "accepted",
      }),
    ).rejects.toThrow("Forbidden");

    await planService.resolveProposal({
      tenantId: HARBOR.tenantId,
      userId: HARBOR.alexId,
      role: "owner",
      proposalId: proposed.proposalId,
      decision: "rejected",
    });
  });
});
