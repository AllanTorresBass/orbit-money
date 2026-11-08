import { describe, expect, it } from "vitest";
import {
  formatDuration,
  runDurationMs,
  runReasonLabel,
  runStatusLabel,
} from "@/lib/utils/pipeline-labels";
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
    errorMessage: null,
    cashCents: 0,
    triggeredByUserId: null,
    ...overrides,
  };
}

const tPipeline = (key: string): string => {
  const labels: Record<string, string> = {
    failed: "Failed",
    running: "Running",
    outOfDate: "Out of date",
    leftoverStuck: "Leftover could not move",
    done: "Done",
    "reasons.no_future_inflow": "No payday is ahead, so there is no daily amount.",
    "reasons.breach_mitigated": "Daily spending was lowered to stay above what you keep.",
    "reasons.abandoned": "This check stopped before it finished.",
    "reasons.database_error": "A database error stopped this check.",
    "reasons.pipeline_exception": "Something went wrong. Orbit will try again overnight.",
  };
  return labels[key] ?? key;
};

const tCommon = (key: string, values?: Record<string, string | number>): string => {
  if (key === "emDash") return "—";
  if (key === "durationMs" && values?.count !== undefined) return `${values.count} ms`;
  if (key === "durationSeconds" && values?.seconds !== undefined) return `${values.seconds} s`;
  return key;
};

describe("pipeline labels", () => {
  it("labels failed, stale, incomplete, and done runs", () => {
    expect(runStatusLabel(run({ status: "error" }), tPipeline).label).toBe("Failed");
    expect(runStatusLabel(run({ status: "stale" }), tPipeline).tone).toBe("short");
    expect(runStatusLabel(run({ sweepIncomplete: true }), tPipeline).label).toBe(
      "Leftover could not move",
    );
    expect(runStatusLabel(run({}), tPipeline).label).toBe("Done");
  });

  it("computes duration", () => {
    expect(runDurationMs(run({}))).toBe(250);
    expect(runDurationMs(run({ finishedAt: null }))).toBeNull();
    expect(formatDuration(250, tCommon)).toBe("250 ms");
    expect(formatDuration(1500, tCommon)).toBe("1.5 s");
    expect(formatDuration(null, tCommon)).toBe("—");
  });

  it("explains a run in plain words from its reason or error code", () => {
    expect(runReasonLabel(run({}), tPipeline)).toBeNull();
    expect(runReasonLabel(run({ reasonCode: "no_future_inflow" }), tPipeline)).toMatch(/payday/i);
    expect(runReasonLabel(run({ reasonCode: "breach_mitigated" }), tPipeline)).toMatch(/lowered/i);
    expect(runReasonLabel(run({ status: "error", reasonCode: "abandoned", errorCode: "abandoned" }), tPipeline))
      .toMatch(/stopped/i);
    expect(runReasonLabel(run({ status: "error", reasonCode: "pg_23505", errorCode: "pg_23505" }), tPipeline))
      .toMatch(/database/i);
    // An unknown code never leaks engine vocabulary.
    expect(runReasonLabel(run({ status: "error", errorCode: "weird_code", reasonCode: null }), tPipeline))
      .toBe("Something went wrong. Orbit will try again overnight.");
  });
});
