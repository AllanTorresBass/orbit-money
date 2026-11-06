import { DateTime } from "luxon";

/**
 * Clamp a calendar day into a month (D11). Day 31 in February becomes the last day.
 * `day` may be -1 meaning last day of the month.
 */
export function clampDayInMonth(year: number, month: number, day: number): string {
  const daysInMonth = DateTime.utc(year, month, 1).daysInMonth ?? 30;
  const clamped = day === -1 ? daysInMonth : Math.min(Math.max(1, day), daysInMonth);
  return DateTime.utc(year, month, clamped).toISODate() ?? "";
}

/** Next calendar month after `iso` (YYYY-MM-DD), same day clamped to month length. */
export function nextClampedMonthlyDate(iso: string, byMonthDay?: number): string | null {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  if (!dt.isValid) return null;
  const next = dt.plus({ months: 1 });
  const day = byMonthDay ?? dt.day;
  const out = clampDayInMonth(next.year, next.month, day);
  return out || null;
}

/** Parse BYMONTHDAY from an RRULE body; null when absent or not a single integer. */
export function byMonthDayFromRrule(rrule: string): number | null {
  const match = /BYMONTHDAY=(-?\d+)/i.exec(rrule);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * The day of month when `rrule` is a plain monthly rule pinned to day 29, 30 or 31 (or the
 * negative counts from the end beyond -28, which no month has). rrule skips months that lack
 * the day, but a bill due on the 31st is due on the last day of a short month (D11), so these
 * rules are expanded here instead. `BYMONTHDAY=-1` already means "last day" to rrule, so it
 * stays there. Null for anything else, including an interval other than 1.
 */
export function monthEndMonthlyDay(rrule: string): number | null {
  if (!/FREQ\s*=\s*MONTHLY/i.test(rrule)) return null;
  const interval = /INTERVAL\s*=\s*(\d+)/i.exec(rrule);
  if (interval && Number(interval[1]) !== 1) return null;
  const day = byMonthDayFromRrule(rrule);
  if (day === null || Math.abs(day) < 29) return null;
  return day;
}

/**
 * Every occurrence of a month-end monthly rule from `anchor` (inclusive) that falls in
 * [from, until], each month clamped to its last day when it is short. Dates are YYYY-MM-DD.
 */
export function monthEndOccurrencesBetween(input: {
  anchor: string;
  byMonthDay: number;
  from: string;
  until: string;
}): string[] {
  const out: string[] = [];
  let cursor = input.anchor;
  // Bounded so a stale anchor years back cannot spin: ten years of months.
  for (let i = 0; i < 120 && cursor <= input.until; i += 1) {
    if (cursor >= input.from) out.push(cursor);
    const next = nextClampedMonthlyDate(cursor, input.byMonthDay);
    if (!next || next <= cursor) break;
    cursor = next;
  }
  return out;
}
