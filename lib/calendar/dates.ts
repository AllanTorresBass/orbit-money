import { DateTime } from "luxon";

/** Local calendar date YYYY-MM-DD in the tenant IANA timezone (D10). */
export function bookedDate(instant: Date, timezone: string): string {
  return DateTime.fromJSDate(instant, { zone: "utc" }).setZone(timezone).toISODate() ?? "";
}

export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return bookedDate(now, timezone);
}

/** Local clock hour 0–23 in the tenant IANA timezone. */
export function localHourInTimezone(timezone: string, now: Date = new Date()): number {
  return DateTime.fromJSDate(now, { zone: "utc" }).setZone(timezone).hour;
}

export function parseISODate(iso: string): DateTime {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  if (!dt.isValid) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return dt.startOf("day");
}

export function addDays(iso: string, days: number): string {
  return parseISODate(iso).plus({ days }).toISODate() ?? iso;
}

export function daysBetween(startInclusive: string, endExclusive: string): number {
  const start = parseISODate(startInclusive);
  const end = parseISODate(endExclusive);
  return Math.floor(end.diff(start, "days").days);
}

/**
 * N_p is days in [today, nextInflow). If inflow is today and not settled, N_p = 1.
 * No future inflow → null (publish no rate) (D8).
 */
export function daysUntilNextInflow(input: {
  today: string;
  nextInflow: string | null;
  inflowIsTodayAndUnsettled?: boolean;
}): number | null {
  const { today, nextInflow, inflowIsTodayAndUnsettled } = input;
  if (inflowIsTodayAndUnsettled) {
    return 1;
  }
  if (!nextInflow) {
    return null;
  }
  const n = daysBetween(today, nextInflow);
  if (n < 1) {
    return null;
  }
  return n;
}
