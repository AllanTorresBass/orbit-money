import { LAST_DAY_OF_MONTH, type Cadence } from "@/types/tenant/create-space.types";

export interface CadenceDays {
  firstDay: number;
  secondDay: number;
  /** Day for "Every month". Defaults to the 1st. */
  monthDay?: number;
}

/** `LAST_DAY_OF_MONTH` becomes `BYMONTHDAY=-1`, which the rrule library reads as the last day. */
function monthlyRule(day: number): string {
  return `FREQ=MONTHLY;BYMONTHDAY=${day}`;
}

/** Calendar order, with the last day of the month after every numbered day. */
function byCalendarOrder(a: number, b: number): number {
  const rank = (day: number): number => (day === LAST_DAY_OF_MONTH ? Number.POSITIVE_INFINITY : day);
  return rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1;
}

/**
 * One recurrence rule per payday series. "Twice a month" is two monthly rules,
 * one per chosen day, never a single rule pinned to one day.
 */
export function rrulesForCadence(cadence: Cadence, days: CadenceDays): string[] {
  switch (cadence) {
    case "Every week":
      return ["FREQ=WEEKLY;INTERVAL=1"];
    case "Twice a month":
      return [days.firstDay, days.secondDay].sort(byCalendarOrder).map(monthlyRule);
    case "Every month":
      return [monthlyRule(days.monthDay ?? 1)];
    case "Once a year":
      return ["FREQ=YEARLY"];
    default:
      return ["FREQ=WEEKLY;INTERVAL=2"];
  }
}
