import { localeConfig } from "@/i18n/config";
import type { AppLocale } from "@/types/i18n/locale.types";

/** Client-side write so the next SSR pass uses the chosen language. */
export function setLocaleCookie(locale: AppLocale): void {
  if (typeof document === "undefined") return;
  const maxAge = localeConfig.cookieMaxAgeSeconds;
  document.cookie = `${localeConfig.cookieName}=${locale};path=/;max-age=${maxAge};samesite=lax`;
}
