import { DateTime } from "luxon";
import type { PoolClient } from "pg";
import { todayInTimezone } from "@/lib/calendar/dates";
import type { CatchUpSelection, TenantSnapshotRow } from "@/types/pipeline/pipeline.types";

/** Most tenants one tick will catch up beyond the hour-0 set. Keeps the tick inside maxDuration. */
export const CATCH_UP_LIMIT = 50;

/** Consecutive failed midnight runs before catch-up gives a tenant a rest. */
export const MAX_CONSECUTIVE_MIDNIGHT_FAILURES = 3;
/** How long catch-up skips a tenant after that many failures. */
export const POISON_SKIP_HOURS = 24;

/** Every tenant with its timezone and the day of its published snapshot (null when none). */
export async function loadTenantSnapshotRows(client: PoolClient): Promise<TenantSnapshotRow[]> {
  const result = await client.query<{
    id: string;
    timezone: string;
    snapshot_as_of_date: string | null;
    midnight_fail_count: number;
    midnight_fail_until: string | null;
  }>(
    `SELECT t.id, t.timezone, s.as_of_date::text AS snapshot_as_of_date,
            t.midnight_fail_count, t.midnight_fail_until::text AS midnight_fail_until
     FROM tenants t
     LEFT JOIN allowance_snapshots s ON s.tenant_id = t.id`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    timezone: row.timezone,
    snapshotAsOfDate: row.snapshot_as_of_date,
    midnightFailCount: row.midnight_fail_count,
    midnightFailUntil: row.midnight_fail_until,
  }));
}

/** True while a tenant's repeated failures keep catch-up away from it. */
export function isMidnightPoisoned(row: TenantSnapshotRow, now: Date): boolean {
  if (!row.midnightFailUntil) return false;
  const until = new Date(row.midnightFailUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/** True when the tenant's published numbers are older than its own local today (or absent). */
export function isSnapshotBehind(row: TenantSnapshotRow, now: Date): boolean {
  if (row.snapshotAsOfDate === null) return true;
  return row.snapshotAsOfDate < todayInTimezone(row.timezone, now);
}

/**
 * True when the zone has no local hour 0 on its current calendar day. A DST change at
 * midnight (the clock jumps 00:00 to 01:00) deletes the hour, so the hour-0 tick never fires.
 * Luxon moves a nonexistent start of day forward, so its hour is not 0 on such a day.
 */
export function skipsLocalHourZero(timezone: string, now: Date = new Date()): boolean {
  const today = todayInTimezone(timezone, now);
  const startOfDay = DateTime.fromISO(today, { zone: timezone }).startOf("day");
  return startOfDay.isValid && startOfDay.hour !== 0;
}

/**
 * Tenants in a zone that lost its midnight hour today, whose numbers are still behind.
 * They are due as soon as the clock is past the gap, ahead of the capped catch-up set.
 * Poisoned tenants are left out like any other catch-up candidate.
 */
export function selectHourZeroSkippedTenantIds(
  rows: TenantSnapshotRow[],
  now: Date,
  alreadyDue?: ReadonlySet<string>,
): string[] {
  return rows
    .filter(
      (row) =>
        !alreadyDue?.has(row.id) &&
        isSnapshotBehind(row, now) &&
        !isMidnightPoisoned(row, now) &&
        skipsLocalHourZero(row.timezone, now),
    )
    .map((row) => row.id)
    .sort();
}

/**
 * Tenants whose published numbers are from before their local today, or that have none.
 * They are the ones a missed hour-0 tick left behind (a deploy, an outage, a failed run).
 * Never-published tenants come first, then the oldest snapshots. Ties break on id so a retry
 * picks the same set. Ids in `alreadyDue` are skipped, and so are tenants whose midnight run
 * failed three times in a row until their rest period ends. At most `limit` are returned;
 * the rest are reported as the backlog.
 */
export function selectCatchUpTenants(
  rows: TenantSnapshotRow[],
  now: Date,
  options?: { limit?: number; alreadyDue?: ReadonlySet<string> },
): CatchUpSelection {
  const limit = Math.max(0, options?.limit ?? CATCH_UP_LIMIT);
  const alreadyDue = options?.alreadyDue;
  let poisonSkipped = 0;
  const stale = rows.filter((row) => {
    if (alreadyDue?.has(row.id)) return false;
    if (!isSnapshotBehind(row, now)) return false;
    if (isMidnightPoisoned(row, now)) {
      poisonSkipped += 1;
      return false;
    }
    return true;
  });
  stale.sort((a, b) => {
    const left = a.snapshotAsOfDate ?? "";
    const right = b.snapshotAsOfDate ?? "";
    if (left !== right) return left < right ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const picked = stale.slice(0, limit);
  return {
    ids: picked.map((row) => row.id),
    staleBacklog: stale.length - picked.length,
    poisonSkipped,
  };
}

/** Ids only. See `selectCatchUpTenants` for the backlog and poison counts. */
export function selectStaleTenantIds(
  rows: TenantSnapshotRow[],
  now: Date,
  options?: { limit?: number; alreadyDue?: ReadonlySet<string> },
): string[] {
  return selectCatchUpTenants(rows, now, options).ids;
}
