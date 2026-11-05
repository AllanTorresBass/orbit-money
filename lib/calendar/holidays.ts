import { DateTime } from "luxon";

/** Minimal US federal holiday set for business-day shifts. Fail closed if region unsupported. */
export function getHolidaySet(region: string, year: number): Set<string> {
  if (region !== "US") {
    throw new Error(`Holiday calendar missing for region: ${region}`);
  }

  const holidays = new Set<string>();
  const add = (month: number, day: number) => {
    holidays.add(
      DateTime.utc(year, month, day).toISODate() ?? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  };

  add(1, 1); // New Year
  add(6, 19); // Juneteenth
  add(7, 4); // Independence
  add(11, 11); // Veterans
  add(12, 25); // Christmas

  // MLK — 3rd Monday of January
  holidays.add(nthWeekday(year, 1, 1, 3));
  // Presidents — 3rd Monday of February
  holidays.add(nthWeekday(year, 2, 1, 3));
  // Memorial — last Monday of May
  holidays.add(lastWeekday(year, 5, 1));
  // Labor — 1st Monday of September
  holidays.add(nthWeekday(year, 9, 1, 1));
  // Thanksgiving — 4th Thursday of November
  holidays.add(nthWeekday(year, 11, 4, 4));

  return holidays;
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  let dt = DateTime.utc(year, month, 1);
  let count = 0;
  while (dt.month === month) {
    if (dt.weekday === weekday) {
      count += 1;
      if (count === n) {
        return dt.toISODate() ?? "";
      }
    }
    dt = dt.plus({ days: 1 });
  }
  throw new Error("nthWeekday not found");
}

function lastWeekday(year: number, month: number, weekday: number): string {
  let dt = DateTime.utc(year, month, 1).endOf("month").startOf("day");
  while (dt.weekday !== weekday) {
    dt = dt.minus({ days: 1 });
  }
  return dt.toISODate() ?? "";
}

export function isNonBusinessDay(iso: string, holidays: Set<string>): boolean {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  if (!dt.isValid) {
    throw new Error(`Invalid date: ${iso}`);
  }
  if (dt.weekday === 6 || dt.weekday === 7) {
    return true;
  }
  return holidays.has(iso);
}

/** Inflows move to previous business day; outflows to the next (D11). */
export function normalizeBusinessDay(
  iso: string,
  direction: "inflow" | "outflow",
  holidays: Set<string>,
): string {
  let current = iso;
  const step = direction === "inflow" ? -1 : 1;
  while (isNonBusinessDay(current, holidays)) {
    const dt = DateTime.fromISO(current, { zone: "utc" }).plus({ days: step });
    current = dt.toISODate() ?? current;
  }
  return current;
}
