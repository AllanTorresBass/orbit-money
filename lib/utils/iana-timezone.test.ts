import { describe, expect, it } from "vitest";
import { isValidIanaTimezone } from "@/lib/utils/iana-timezone";

describe("isValidIanaTimezone", () => {
  it("accepts known zones", () => {
    expect(isValidIanaTimezone("America/New_York")).toBe(true);
    expect(isValidIanaTimezone("UTC")).toBe(true);
  });

  it("rejects junk", () => {
    expect(isValidIanaTimezone("Not/AZone")).toBe(false);
    expect(isValidIanaTimezone("")).toBe(false);
  });
});
