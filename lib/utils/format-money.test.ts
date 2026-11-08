import { describe, expect, it } from "vitest";
import { formatMoney, formatShortDate } from "@/lib/utils";

describe("formatMoney", () => {
  it("formats whole dollars without cents by default", () => {
    expect(formatMoney(120_000, { locale: "en" })).toMatch(/1,200/);
  });

  it("always shows cents when asked", () => {
    expect(formatMoney(112_18, { locale: "en", alwaysCents: true })).toMatch(/112\.18/);
  });

  it("uses Spanish grouping for es", () => {
    const text = formatMoney(120_000, { locale: "es" });
    expect(text.includes("1.200") || text.includes("1200")).toBe(true);
  });
});

describe("formatShortDate", () => {
  it("formats an ISO calendar date in English", () => {
    expect(formatShortDate("2026-11-18", "en")).toMatch(/Nov/);
  });

  it("formats an ISO calendar date in Spanish", () => {
    const text = formatShortDate("2026-11-18", "es");
    expect(text.toLowerCase()).toMatch(/nov/);
  });
});
