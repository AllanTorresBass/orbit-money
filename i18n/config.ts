import { DEFAULT_LOCALE, LOCALES, type AppLocale } from "@/types/i18n/locale.types";

/** Cookie that holds the UI language for same-URL i18n (no `/en` prefix). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeConfig = {
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  cookieName: LOCALE_COOKIE,
  /** Remember the choice for a year. */
  cookieMaxAgeSeconds: 60 * 60 * 24 * 365,
} as const;

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (value === "es" || value?.toLowerCase().startsWith("es")) {
    return "es";
  }
  return DEFAULT_LOCALE;
}

/** Best-fit from an Accept-Language header. */
export function localeFromAcceptLanguage(header: string | null): AppLocale {
  if (!header) return DEFAULT_LOCALE;
  const parts = header.split(",").map((part) => {
    const [tag, ...params] = part.trim().split(";");
    const qParam = params.find((p) => p.trim().startsWith("q="));
    const q = qParam ? Number(qParam.trim().slice(2)) : 1;
    return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1 };
  });
  parts.sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    if (tag === "es" || tag.startsWith("es-")) return "es";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return DEFAULT_LOCALE;
}
