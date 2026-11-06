import type { PoolClient } from "pg";
import { todayInTimezone } from "@/lib/calendar/dates";
import type { TenantSnapshotRow } from "@/types/pipeline/pipeline.types";

/** Most tenants one tick will catch up beyond the hour-0 set. Keeps the tick inside maxDuration. */
export const CATCH_UP_LIMIT = 50;

/** Every tenant with its timezone and the day of its published snapshot (null when none). */
export async function loadTenantSnapshotRows(client: PoolClient): Promise<TenantSnapshotRow[]> {
  const result = await client.query<{
    id: string;
    timezone: string;
    snapshot_as_of_date: string | null;
  }>(
    `SELECT t.id, t.timezone, s.as_of_date::text AS snapshot_as_of_date
     FROM tenants t
     LEFT JOIN allowance_snapshots s ON s.tenant_id = t.id`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    timezone: row.timezone,
    snapshotAsOfDate: row.snapshot_as_of_date,
  }));
}

/**
 * Tenants whose published numbers are from before their local today, or that have none.
 * They are the ones a missed hour-0 tick left behind (a deploy, an outage, a failed run).
 * Never-published tenants come first, then the oldest snapshots. Ties break on id so a retry
 * picks the same set. Ids in `alreadyDue` are skipped. At most `limit` are returned.
 */
export function selectStaleTenantIds(
  rows: TenantSnapshotRow[],
  now: Date,
  options?: { limit?: number; alreadyDue?: ReadonlySet<string> },
): string[] {
  const limit = options?.limit ?? CATCH_UP_LIMIT;
  const alreadyDue = options?.alreadyDue;
  const stale = rows.filter((row) => {
    if (alreadyDue?.has(row.id)) return false;
    if (row.snapshotAsOfDate === null) return true;
    return row.snapshotAsOfDate < todayInTimezone(row.timezone, now);
  });
  stale.sort((a, b) => {
    const left = a.snapshotAsOfDate ?? "";
    const right = b.snapshotAsOfDate ?? "";
    if (left !== right) return left < right ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return stale.slice(0, Math.max(0, limit)).map((row) => row.id);
}
