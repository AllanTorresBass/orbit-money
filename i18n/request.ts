import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { localeConfig, localeFromAcceptLanguage, normalizeLocale } from "@/i18n/config";
import { DEFAULT_LOCALE, type AppLocale } from "@/types/i18n/locale.types";

async function resolveRequestLocale(): Promise<AppLocale> {
  const jar = await cookies();
  const fromCookie = jar.get(localeConfig.cookieName)?.value;
  if (fromCookie) {
    return normalizeLocale(fromCookie);
  }
  const accept = (await headers()).get("accept-language");
  return localeFromAcceptLanguage(accept);
}

export default getRequestConfig(async () => {
  const locale = await resolveRequestLocale();
  const messages = (await import(`../messages/${locale}.json`)).default as Record<
    string,
    unknown
  >;
  const fallback =
    locale === DEFAULT_LOCALE
      ? messages
      : ((await import(`../messages/${DEFAULT_LOCALE}.json`)).default as Record<string, unknown>);

  return {
    locale,
    messages,
    getMessageFallback({ namespace, key }) {
      const path = namespace ? `${namespace}.${key}` : key;
      const parts = path.split(".");
      let node: unknown = fallback;
      for (const part of parts) {
        if (node && typeof node === "object" && part in node) {
          node = (node as Record<string, unknown>)[part];
        } else {
          return path;
        }
      }
      return typeof node === "string" ? node : path;
    },
  };
});
