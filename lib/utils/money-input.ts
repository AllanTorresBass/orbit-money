/**
 * Parse text a person typed into integer cents without binary floating point.
 * Accepts "40", "40.5", "$1,200.25", ".5". Returns null when it is not money.
 * A third decimal digit rounds half up ("1.005" -> 101).
 */
export function parseDollarsToCents(
  input: string,
  options?: { allowNegative?: boolean },
): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) {
    return null;
  }
  const [, sign, whole = "", frac = ""] = match;
  if (whole === "" && frac === "") {
    return null;
  }
  if (sign && !options?.allowNegative) {
    return null;
  }

  const wholeCents = Number(whole === "" ? "0" : whole) * 100;
  const fracCents = Number((frac + "00").slice(0, 2));
  const roundUp = frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0;
  const cents = wholeCents + fracCents + roundUp;
  if (!Number.isSafeInteger(cents)) {
    return null;
  }
  return sign ? -cents : cents;
}
