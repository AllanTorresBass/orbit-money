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
