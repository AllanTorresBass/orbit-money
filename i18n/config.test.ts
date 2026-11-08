import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage, normalizeLocale } from "@/i18n/config";

describe("normalizeLocale", () => {
  it("accepts en and es", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("es")).toBe("es");
  });

  it("falls back to en", () => {
    expect(normalizeLocale("fr")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });
});

describe("localeFromAcceptLanguage", () => {
  it("prefers Spanish when listed first", () => {
    expect(localeFromAcceptLanguage("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
  });

  it("picks English when that is the best match", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
  });

  it("defaults when the header is empty", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });
});
