import { DateTime } from "luxon";
import { rrulestr, type RRule } from "rrule";

function toRRuleDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** First date on or after `fromDate` that the rule produces. Falls back to `fromDate`. */
export function firstOccurrenceOnOrAfter(rrule: string, fromDate: string): string {
  const text = rrule.trim().toUpperCase().startsWith("RRULE:")
    ? rrule.trim()
    : `RRULE:${rrule.trim()}`;
  try {
    const rule = rrulestr(text, { dtstart: toRRuleDate(fromDate) }) as RRule;
    const next = rule.after(toRRuleDate(fromDate), true);
    if (!next) {
      return fromDate;
    }
    return DateTime.fromJSDate(next, { zone: "utc" }).toISODate() ?? fromDate;
  } catch {
    return fromDate;
  }
}
