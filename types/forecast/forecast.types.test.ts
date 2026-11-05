import { describe, expect, it } from "vitest";
import { forecastDateParamSchema } from "@/types/forecast/forecast.types";

describe("forecastDateParamSchema", () => {
  it("accepts a real calendar date", () => {
    expect(forecastDateParamSchema.safeParse({ date: "2026-11-18" }).success).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(forecastDateParamSchema.safeParse({ date: "11/18/2026" }).success).toBe(false);
    expect(forecastDateParamSchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(forecastDateParamSchema.safeParse({ date: "2026-13-01" }).success).toBe(false);
  });
});
