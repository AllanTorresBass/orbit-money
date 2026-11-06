import { describe, expect, it } from "vitest";
import { pickTenantForSession } from "@/lib/auth/tenant-pick";

describe("pickTenantForSession", () => {
  it("prefers the household cookie over the tenant pinned in the Auth.js token", () => {
    expect(
      pickTenantForSession({ userId: "u", sessionTenantId: "first", cookieTenantId: "second" }),
    ).toEqual({ userId: "u", tenantId: "second", fallbackTenantId: "first" });
  });

  it("uses the token tenant when no cookie is set", () => {
    expect(
      pickTenantForSession({ userId: "u", sessionTenantId: "first", cookieTenantId: undefined }),
    ).toEqual({ userId: "u", tenantId: "first" });
  });

  it("uses the cookie when the token pinned nothing", () => {
    expect(
      pickTenantForSession({ userId: "u", sessionTenantId: "", cookieTenantId: "picked" }),
    ).toEqual({ userId: "u", tenantId: "picked", fallbackTenantId: null });
  });

  it("names no tenant when neither is set", () => {
    expect(
      pickTenantForSession({ userId: "u", sessionTenantId: undefined, cookieTenantId: undefined }),
    ).toEqual({ userId: "u", tenantId: null });
  });
});
