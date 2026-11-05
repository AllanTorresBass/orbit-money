import type { Cadence } from "@/types/tenant/create-space.types";

/**
 * One recurrence rule per payday series. "Twice a month" is two monthly rules,
 * one per chosen day, never a single rule pinned to one day.
 */
export function rrulesForCadence(
  cadence: Cadence,
  days: { firstDay: number; secondDay: number },
): string[] {
  switch (cadence) {
    case "Every week":
      return ["FREQ=WEEKLY;INTERVAL=1"];
    case "Twice a month":
      return [days.firstDay, days.secondDay]
        .sort((a, b) => a - b)
        .map((day) => `FREQ=MONTHLY;BYMONTHDAY=${day}`);
    case "Every month":
      return ["FREQ=MONTHLY;BYMONTHDAY=1"];
    case "Once a year":
      return ["FREQ=YEARLY"];
    default:
      return ["FREQ=WEEKLY;INTERVAL=2"];
  }
}
