/** The guide's example floor: $200, in cents. Offered, never written for the person. */
export const GUIDE_FLOOR_CENTS = 20_000;

/** One week of the current daily pace, rounded to the nearest whole dollar. Integer cents. */
export function weekOfSpendingCents(sDailyCents: number): number {
  if (sDailyCents <= 0) return 0;
  return Math.round((sDailyCents * 7) / 100) * 100;
}
