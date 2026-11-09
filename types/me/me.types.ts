import { z } from "zod";
import type { AppLocale } from "@/types/i18n/locale.types";
import type { PersonRole } from "@/types/people/people.types";
import { entityIdSchema } from "@/types/shared/ids";
import type { TenantType } from "@/types/tenant/tenant.types";

export interface MeDto {
  userId: string;
  tenantId: string;
  role: PersonRole;
  email: string;
  name: string;
  tenantName: string;
  tenantType: TenantType;
  /** IANA zone of the current household. The household's "today" follows it. */
  timezone: string;
  /** Per-person UI language. Independent of household timezone. */
  preferredLocale: AppLocale;
  canSpend: boolean;
  /** Every household this person is an active member of, for the switcher. */
  tenants: TenantChoice[];
}

export interface TenantChoice {
  tenantId: string;
  tenantName: string;
}

export const selectTenantBodySchema = z.object({
  tenantId: entityIdSchema,
});
export type SelectTenantBody = z.infer<typeof selectTenantBodySchema>;

/** `users.name` is VARCHAR(100). */
export const DISPLAY_NAME_MAX = 100;

/** Trim, then collapse internal whitespace. Letters and accents stay. */
export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * The caller's own display name. Messages are catalog keys under `you.*`.
 * A body that also sends `preferredLocale` is rejected by the route.
 */
export const updateNameBodySchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "nameRequired")
    .max(DISPLAY_NAME_MAX, "nameTooLong")
    .transform((value) => value.replace(/\s+/g, " ")),
});
export type UpdateNameBody = z.infer<typeof updateNameBodySchema>;
