import { z } from "zod";

export const LOCALES = ["en", "es"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const appLocaleSchema = z.enum(LOCALES);
export const DEFAULT_LOCALE: AppLocale = "en";

export const updateLocaleBodySchema = z.object({
  preferredLocale: appLocaleSchema,
});
export type UpdateLocaleBody = z.infer<typeof updateLocaleBodySchema>;

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "en" || value === "es";
}
