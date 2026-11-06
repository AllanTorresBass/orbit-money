import { describe, expect, it } from "vitest";
import { decideForceAll } from "@/lib/pipeline/force-all";

describe("decideForceAll", () => {
  it("is off without ?all=1, whatever the header says", () => {
    expect(decideForceAll({ allParam: null, headerValue: null })).toBe("off");
    expect(decideForceAll({ allParam: null, headerValue: "1" })).toBe("off");
    expect(decideForceAll({ allParam: "0", headerValue: "1" })).toBe("off");
  });

  it("rejects ?all=1 without the confirmation header", () => {
    expect(decideForceAll({ allParam: "1", headerValue: null })).toBe("rejected");
    expect(decideForceAll({ allParam: "1", headerValue: "true" })).toBe("rejected");
  });

  it("forces every tenant only with both", () => {
    expect(decideForceAll({ allParam: "1", headerValue: "1" })).toBe("forced");
  });
});
