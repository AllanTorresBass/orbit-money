import { describe, expect, it } from "vitest";
import { clientLogRateLimitKey } from "@/lib/observability/client-log";
import { magicLinkRateLimitKey } from "@/lib/auth/rate-limit";
import { clientLogBodySchema } from "@/types/observability/client-log.types";

describe("client log", () => {
  it("keys the limiter apart from magic-link counters", () => {
    const key = clientLogRateLimitKey("11111111-1111-1111-1111-111111111111");
    expect(key.startsWith("client-log:")).toBe(true);
    expect(key.startsWith("magic-link:")).toBe(false);
    expect(magicLinkRateLimitKey("a@b.co").startsWith("client-log:")).toBe(false);
  });

  it("accepts info and warn, and refuses error, empty, or oversized messages", () => {
    expect(clientLogBodySchema.safeParse({ level: "warn", message: "Save failed" }).success).toBe(
      true,
    );
    expect(
      clientLogBodySchema.safeParse({ level: "info", message: "ok", route: "/plan" }).success,
    ).toBe(true);
    expect(clientLogBodySchema.safeParse({ level: "error", message: "x" }).success).toBe(false);
    expect(clientLogBodySchema.safeParse({ level: "warn", message: "  " }).success).toBe(false);
    expect(clientLogBodySchema.safeParse({ level: "warn", message: "x".repeat(301) }).success).toBe(
      false,
    );
  });
});
