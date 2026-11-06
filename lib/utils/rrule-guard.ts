const FORBIDDEN = /\bFREQ\s*=\s*(SECONDLY|MINUTELY|HOURLY)\b/i;

/** Reject recurrence rules that would expand into unbounded short intervals. */
export function isSafePaydayRrule(rrule: string): boolean {
  const text = rrule.trim();
  if (!text || text.length > 200) return false;
  if (FORBIDDEN.test(text)) return false;
  const upper = text.toUpperCase();
  if (!upper.includes("FREQ=")) return false;
  return true;
}
