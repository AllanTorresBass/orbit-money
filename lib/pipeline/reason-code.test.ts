import { describe, expect, it } from "vitest";
import { pickReasonCode } from "@/lib/pipeline/reason-code";

const calm = { nP: 14, cutsApplied: 0, breachDate: null, sweepSkippedNoSink: false };

describe("pickReasonCode", () => {
  it("is ok on a quiet run", () => {
    expect(pickReasonCode(calm)).toBe("ok");
  });

  it("reports no future inflow before anything else", () => {
    expect(pickReasonCode({ ...calm, nP: null, cutsApplied: 1 })).toBe("no_future_inflow");
  });

  it("separates a cleared breach from one that remains", () => {
    expect(pickReasonCode({ ...calm, cutsApplied: 1 })).toBe("breach_mitigated");
    expect(pickReasonCode({ ...calm, cutsApplied: 2, breachDate: "2026-11-20" })).toBe(
      "breach_alert",
    );
  });

  it("reports a sweep with nowhere to go", () => {
    expect(pickReasonCode({ ...calm, sweepSkippedNoSink: true })).toBe("sweep_skipped_no_sink");
  });
});
