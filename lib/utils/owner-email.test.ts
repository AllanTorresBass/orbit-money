import { describe, expect, it } from "vitest";
import { resolveOwnerEmail } from "@/lib/utils/owner-email";

describe("resolveOwnerEmail", () => {
  it("prefers the query email", () => {
    expect(
      resolveOwnerEmail({
        queryEmail: "Pat.Lee@Example.com",
        sessionEmail: "other@example.com",
        spaceName: "Harbor",
      }),
    ).toEqual({ email: "pat.lee@example.com", name: "Pat Lee" });
  });

  it("falls back to the session email", () => {
    expect(
      resolveOwnerEmail({ queryEmail: null, sessionEmail: "sam@example.com", spaceName: "Harbor" })
        .email,
    ).toBe("sam@example.com");
  });

  it("ignores an invalid query email", () => {
    expect(
      resolveOwnerEmail({ queryEmail: "nope", sessionEmail: "sam@example.com", spaceName: "H" })
        .email,
    ).toBe("sam@example.com");
  });

  it("uses a placeholder only when no real email exists", () => {
    expect(
      resolveOwnerEmail({ queryEmail: null, sessionEmail: null, spaceName: "My Space" }),
    ).toEqual({ email: "my.space@orbit.local", name: "Owner" });
  });
});
