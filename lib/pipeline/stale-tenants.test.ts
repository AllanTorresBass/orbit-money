import { describe, expect, it } from "vitest";
import {
  isMidnightPoisoned,
  selectCatchUpTenants,
  selectHourZeroSkippedTenantIds,
  selectStaleTenantIds,
  skipsLocalHourZero,
} from "@/lib/pipeline/stale-tenants";
import type { TenantSnapshotRow } from "@/types/pipeline/pipeline.types";

// 2026-11-05T14:00Z is Nov 5 in New York and Nov 6 in Auckland.
const NOW = new Date("2026-11-05T14:00:00Z");

function row(id: string, timezone: string, snapshotAsOfDate: string | null): TenantSnapshotRow {
  return { id, timezone, snapshotAsOfDate };
}

describe("selectStaleTenantIds", () => {
  it("picks tenants whose snapshot is before their own local today", () => {
    const rows = [
      row("a", "America/New_York", "2026-11-05"), // current
      row("b", "America/New_York", "2026-11-04"), // a day behind
      row("c", "Pacific/Auckland", "2026-11-05"), // local today is Nov 6
    ];
    // Oldest snapshot first.
    expect(selectStaleTenantIds(rows, NOW)).toEqual(["b", "c"]);
  });

  it("includes tenants with no snapshot, ahead of the oldest snapshots", () => {
    const rows = [
      row("old", "UTC", "2026-11-01"),
      row("never", "UTC", null),
      row("fresh", "UTC", "2026-11-05"),
    ];
    expect(selectStaleTenantIds(rows, NOW)).toEqual(["never", "old"]);
  });

  it("skips tenants already due this tick", () => {
    const rows = [row("a", "UTC", "2026-11-01"), row("b", "UTC", "2026-11-02")];
    expect(selectStaleTenantIds(rows, NOW, { alreadyDue: new Set(["a"]) })).toEqual(["b"]);
  });

  it("caps the catch-up set and keeps the oldest first", () => {
    const rows = Array.from({ length: 80 }, (_, i) =>
      row(`t${String(i).padStart(2, "0")}`, "UTC", `2026-10-${String((i % 28) + 1).padStart(2, "0")}`),
    );
    const picked = selectStaleTenantIds(rows, NOW, { limit: 50 });
    expect(picked).toHaveLength(50);
    expect(new Set(picked).size).toBe(50);
    const dates = picked.map((id) => rows.find((r) => r.id === id)?.snapshotAsOfDate ?? "");
    expect([...dates].sort()).toEqual(dates);
  });

  it("returns nothing when every snapshot is from today", () => {
    expect(selectStaleTenantIds([row("a", "UTC", "2026-11-05")], NOW)).toEqual([]);
  });

  it("returns nothing for a zero limit", () => {
    expect(selectStaleTenantIds([row("a", "UTC", null)], NOW, { limit: 0 })).toEqual([]);
  });
});

describe("catch-up resilience", () => {
  const futureRest = "2026-11-06T14:00:00Z";
  const pastRest = "2026-11-04T14:00:00Z";

  it("skips a tenant whose midnight run keeps failing until the rest ends", () => {
    const rows: TenantSnapshotRow[] = [
      { ...row("bad", "UTC", "2026-11-01"), midnightFailCount: 3, midnightFailUntil: futureRest },
      { ...row("rested", "UTC", "2026-11-02"), midnightFailCount: 3, midnightFailUntil: pastRest },
      row("ok", "UTC", "2026-11-03"),
    ];
    expect(isMidnightPoisoned(rows[0], NOW)).toBe(true);
    expect(isMidnightPoisoned(rows[1], NOW)).toBe(false);
    const picked = selectCatchUpTenants(rows, NOW);
    expect(picked.ids).toEqual(["rested", "ok"]);
    expect(picked.poisonSkipped).toBe(1);
    expect(picked.staleBacklog).toBe(0);
  });

  it("reports the stale backlog beyond the limit", () => {
    const rows = ["a", "b", "c", "d"].map((id, i) => row(id, "UTC", `2026-11-0${i + 1}`));
    const picked = selectCatchUpTenants(rows, NOW, { limit: 3 });
    expect(picked.ids).toEqual(["a", "b", "c"]);
    expect(picked.staleBacklog).toBe(1);
  });

  it("finds a zone whose clock skips local midnight", () => {
    // Cuba springs forward at 00:00 on 2026-03-08: there is no hour 0 that day.
    const dstDay = new Date("2026-03-08T12:00:00Z");
    expect(skipsLocalHourZero("America/Havana", dstDay)).toBe(true);
    expect(skipsLocalHourZero("America/Havana", new Date("2026-03-09T12:00:00Z"))).toBe(false);
    expect(skipsLocalHourZero("America/New_York", dstDay)).toBe(false);
    expect(skipsLocalHourZero("UTC", dstDay)).toBe(false);
  });

  it("makes behind tenants in a midnight-skipping zone due, but not current or poisoned ones", () => {
    const dstDay = new Date("2026-03-08T12:00:00Z");
    const rows: TenantSnapshotRow[] = [
      row("behind", "America/Havana", "2026-03-07"),
      row("current", "America/Havana", "2026-03-08"),
      { ...row("poisoned", "America/Havana", "2026-03-07"), midnightFailUntil: "2026-03-09T00:00:00Z" },
      row("elsewhere", "America/New_York", "2026-03-07"),
    ];
    expect(selectHourZeroSkippedTenantIds(rows, dstDay)).toEqual(["behind"]);
    expect(selectHourZeroSkippedTenantIds(rows, dstDay, new Set(["behind"]))).toEqual([]);
  });
});
