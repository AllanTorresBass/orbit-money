import { describe, expect, it } from "vitest";
import { formatDuration, runDurationMs, runStatusLabel } from "@/lib/utils/pipeline-labels";
import type { PipelineRunListItem } from "@/types/pipeline/pipeline.types";

function run(overrides: Partial<PipelineRunListItem>): PipelineRunListItem {
  return {
    id: "r1",
    trigger: "sync",
    asOfDate: "2026-11-04",
    startedAt: "2026-11-04T10:00:00.000Z",
    finishedAt: "2026-11-04T10:00:00.250Z",
    status: "ok",
    forecastStale: false,
    cutsApplied: 0,
    oUnfundedCents: 0,
    sDailyCents: 0,
    sTodayCents: 0,
    nP: 14,
    sweepIncomplete: false,
    cronBatchId: null,
    errorCode: null,
    reasonCode: "ok",
    cashCents: 0,
    triggeredByUserId: null,
    ...overrides,
  };
}

describe("pipeline labels", () => {
  it("labels failed, stale, incomplete, and done runs", () => {
    expect(runStatusLabel(run({ status: "error" })).label).toBe("Failed");
    expect(runStatusLabel(run({ status: "stale" })).tone).toBe("short");
    expect(runStatusLabel(run({ sweepIncomplete: true })).label).toBe("Leftover could not move");
    expect(runStatusLabel(run({})).label).toBe("Done");
  });

  it("computes duration", () => {
    expect(runDurationMs(run({}))).toBe(250);
    expect(runDurationMs(run({ finishedAt: null }))).toBeNull();
    expect(formatDuration(250)).toBe("250 ms");
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(null)).toBe("—");
  });
});
