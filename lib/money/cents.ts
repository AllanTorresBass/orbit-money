/** Integer-cent helpers. Never use binary floating point for allocation. */

export function dollarsToCents(dollars: number | string): number {
  const n = typeof dollars === "string" ? Number(dollars) : dollars;
  if (!Number.isFinite(n)) {
    throw new Error("Invalid dollar amount");
  }
  return Math.round(n * 100);
}

export function centsToDollarsNumber(cents: number): number {
  return cents / 100;
}

export function floorCents(cents: number): number {
  return Math.floor(cents);
}

export function ceilCents(cents: number): number {
  return Math.ceil(cents);
}

/** Floor the daily rate; leftover cents return as remainder for today (D1). */
export function splitDailyRate(
  spendableCents: number,
  days: number,
): { daily: number; remainder: number } {
  if (days < 1) {
    throw new Error("days must be >= 1");
  }
  if (spendableCents <= 0) {
    return { daily: 0, remainder: 0 };
  }
  const daily = Math.floor(spendableCents / days);
  const remainder = spendableCents - days * daily;
  return { daily, remainder };
}
