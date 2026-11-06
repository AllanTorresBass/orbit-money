import { addDays, parseISODate } from "@/lib/calendar/dates";
import { getHolidaySet, normalizeBusinessDay } from "@/lib/calendar/holidays";

/**
 * Holidays for a tenant region across `[startIso, endIso]`, with a year of margin
 * on both sides so a business-day shift never falls off the loaded range.
 * Throws when the region has no calendar (fail closed, docs/08).
 */
export function holidaySetForRange(region: string, startIso: string, endIso: string): Set<string> {
  const startYear = parseISODate(startIso).year - 1;
  const endYear = parseISODate(endIso).year + 1;
  const holidays = new Set<string>();
  for (let year = startYear; year <= endYear; year += 1) {
    for (const day of getHolidaySet(region, year)) holidays.add(day);
  }
  return holidays;
}

/** Holidays a pipeline run needs: a week back to a year ahead of `today`. Null when the region has none. */
export function loadTenantHolidays(region: string, today: string): Set<string> | null {
  try {
    return holidaySetForRange(region, addDays(today, -7), addDays(today, 400));
  } catch {
    return null;
  }
}

/** A stored schedule date as money actually moves: inflows go to the prior business day (D11). */
export function effectiveInflowDate(iso: string, holidays: Set<string> | null): string {
  return holidays ? normalizeBusinessDay(iso, "inflow", holidays) : iso;
}

/**
 * Next payday on the business-day calendar.
 * Prefers the earliest date after `today`, then a payday that lands on `today`.
 * An unsettled payday from an earlier day is overdue, not upcoming, so it is skipped.
 */
export function pickNextInflowDate(
  storedDates: readonly string[],
  today: string,
  holidays: Set<string> | null,
): string | null {
  const effective = storedDates.map((d) => effectiveInflowDate(d, holidays)).sort();
  const future = effective.find((d) => d > today);
  if (future) return future;
  return effective.find((d) => d === today) ?? null;
}

/** A deposit counts as the scheduled payday when it is within a cent of the schedule amount. */
export const INFLOW_MATCH_TOLERANCE_CENTS = 1;

export function matchesScheduledAmount(depositCents: number, scheduledCents: number): boolean {
  return Math.abs(depositCents - scheduledCents) <= INFLOW_MATCH_TOLERANCE_CENTS;
}
