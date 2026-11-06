import { describe, expect, it } from "vitest";
import { magicLinkRateLimitKey } from "@/lib/auth/rate-limit";

describe("magicLinkRateLimitKey", () => {
  it("ignores case and surrounding space", () => {
    expect(magicLinkRateLimitKey("  Blair@Harbor.test ")).toBe(
      magicLinkRateLimitKey("blair@harbor.test"),
    );
  });

  it("never contains the address", () => {
    expect(magicLinkRateLimitKey("blair@harbor.test")).not.toContain("blair");
  });

  it("separates different addresses", () => {
    expect(magicLinkRateLimitKey("a@x.test")).not.toBe(magicLinkRateLimitKey("b@x.test"));
  });
});
