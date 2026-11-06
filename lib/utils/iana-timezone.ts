/** True when `zone` is a real IANA timezone the runtime understands. */
export function isValidIanaTimezone(zone: string): boolean {
  const trimmed = zone.trim();
  if (!trimmed || trimmed.length > 64) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}
