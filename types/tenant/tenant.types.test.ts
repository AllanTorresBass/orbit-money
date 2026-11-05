import { describe, expect, it } from "vitest";
import { createTenantBodySchema } from "@/types/tenant/tenant.types";

const base = {
  name: "Harbor",
  tenantType: "household" as const,
  ownerEmail: "owner@orbit.local",
  ownerName: "Owner",
  timezone: "America/New_York",
  paydayAmountCents: 300000,
  nextPayday: "2026-11-18",
};

describe("createTenantBodySchema", () => {
  it("normalizes a single rrule to rrules", () => {
    const parsed = createTenantBodySchema.parse({ ...base, rrule: "FREQ=WEEKLY;INTERVAL=2" });
    expect(parsed.rrules).toEqual(["FREQ=WEEKLY;INTERVAL=2"]);
  });

  it("keeps two rrules for twice a month", () => {
    const parsed = createTenantBodySchema.parse({
      ...base,
      rrules: ["FREQ=MONTHLY;BYMONTHDAY=1", "FREQ=MONTHLY;BYMONTHDAY=15"],
    });
    expect(parsed.rrules).toHaveLength(2);
  });

  it("rejects a body with neither rrule nor rrules, and bad dates", () => {
    expect(createTenantBodySchema.safeParse(base).success).toBe(false);
    expect(
      createTenantBodySchema.safeParse({ ...base, nextPayday: "2026-02-31", rrule: "FREQ=WEEKLY" })
        .success,
    ).toBe(false);
  });
});
