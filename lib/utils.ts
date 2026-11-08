import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AppLocale } from "@/types/i18n/locale.types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function dollarsFromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
}

function intlLocale(locale: AppLocale | string | undefined): string {
  if (locale === "es" || locale?.toLowerCase().startsWith("es")) return "es";
  return "en-US";
}

export interface FormatMoneyOptions {
  alwaysCents?: boolean;
  locale?: AppLocale | string;
  /** ISO 4217. Defaults to USD. */
  currency?: string;
}

/**
 * Display-only money. Math stays in integer cents elsewhere.
 * Uses Intl for separators; keeps a currency symbol from the currency code.
 */
export function formatMoney(cents: number, options?: FormatMoneyOptions): string {
  const alwaysCents = options?.alwaysCents ?? false;
  const locale = intlLocale(options?.locale);
  const currency = options?.currency ?? "USD";
  const abs = Math.abs(cents);
  const amount = abs / 100;
  const fractionDigits = !alwaysCents && abs % 100 === 0 ? 0 : 2;
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
  return cents < 0 ? `-${formatted.replace(/^-/, "")}` : formatted;
}

export function formatShortDate(
  isoDate: string,
  locale: AppLocale | string = "en",
): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString(intlLocale(locale), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
