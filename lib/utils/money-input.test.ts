import { describe, expect, it } from "vitest";
import { parseDollarsToCents } from "@/lib/utils/money-input";

describe("parseDollarsToCents", () => {
  it("parses whole and fractional dollars without float drift", () => {
    expect(parseDollarsToCents("40")).toBe(4000);
    expect(parseDollarsToCents("40.5")).toBe(4050);
    expect(parseDollarsToCents("0.07")).toBe(7);
    expect(parseDollarsToCents("19.99")).toBe(1999);
    expect(parseDollarsToCents("1.15")).toBe(115);
    expect(parseDollarsToCents("8.2")).toBe(820);
  });

  it("accepts symbols, commas, and a bare decimal", () => {
    expect(parseDollarsToCents("$1,200.25")).toBe(120025);
    expect(parseDollarsToCents(" .5 ")).toBe(50);
    expect(parseDollarsToCents("12.")).toBe(1200);
  });

  it("rounds a third decimal half up", () => {
    expect(parseDollarsToCents("1.005")).toBe(101);
    expect(parseDollarsToCents("1.004")).toBe(100);
  });

  it("rejects text, empty input, and negatives unless allowed", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents(".")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("1.2.3")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("-5", { allowNegative: true })).toBe(-500);
  });
});
