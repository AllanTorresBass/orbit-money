import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/utils/promise-pool";

describe("mapWithConcurrency", () => {
  it("never exceeds the limit and keeps input order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9], 4, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async (n: number) => n)).toEqual([]);
  });
});
