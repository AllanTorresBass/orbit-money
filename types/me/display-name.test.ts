import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX,
  normalizeDisplayName,
  updateNameBodySchema,
} from "@/types/me/me.types";

describe("normalizeDisplayName", () => {
  it("trims and collapses internal spaces", () => {
    expect(normalizeDisplayName("  Ana   María  ")).toBe("Ana María");
  });

  it("keeps accents", () => {
    expect(normalizeDisplayName("José")).toBe("José");
  });
});

describe("updateNameBodySchema", () => {
  it("stores the collapsed name", () => {
    expect(updateNameBodySchema.parse({ name: "  Ana   María  " })).toEqual({
      name: "Ana María",
    });
  });

  it("rejects a blank name", () => {
    const parsed = updateNameBodySchema.safeParse({ name: "   " });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("nameRequired");
    }
  });

  it("rejects a name longer than the column", () => {
    const parsed = updateNameBodySchema.safeParse({ name: "A".repeat(DISPLAY_NAME_MAX + 1) });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("nameTooLong");
    }
  });

  it("accepts a name at the column limit", () => {
    const name = "A".repeat(DISPLAY_NAME_MAX);
    expect(updateNameBodySchema.parse({ name })).toEqual({ name });
  });

  it("rejects a locale field on the same body", () => {
    const parsed = updateNameBodySchema.safeParse({
      name: "Ana",
      preferredLocale: "en",
    });
    expect(parsed.success).toBe(false);
  });
});
