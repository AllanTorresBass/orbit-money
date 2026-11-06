import { todayInTimezone } from "@/lib/calendar/dates";

/** Shown on Today when the published numbers are from a day before the household's today. */
export const STALE_NUMBERS_SENTENCE =
  "Numbers are from an earlier day. They will refresh overnight.";

/**
 * True when the allowance was computed for a date before the household's local today.
 * ISO dates compare lexically. An unknown timezone cannot be judged, so it is never stale.
 */
export function isAllowanceFromEarlierDay(
  asOfDate: string,
  timezone: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!timezone) return false;
  const today = todayInTimezone(timezone, now);
  return today !== "" && asOfDate < today;
}
