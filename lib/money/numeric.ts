/** Convert Postgres NUMERIC / string / number to integer cents. */
export function toCents(value: string | number): number {
  if (typeof value === "number") {
    return Math.round(value * 100);
  }
  const cleaned = value.trim();
  const negative = cleaned.startsWith("-");
  const raw = negative ? cleaned.slice(1) : cleaned;
  const [whole, frac = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
}
