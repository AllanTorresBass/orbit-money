import { z } from "zod";
import type { PersonRole } from "@/types/people/people.types";
import { entityIdSchema } from "@/types/shared/ids";

export interface MeDto {
  userId: string;
  tenantId: string;
  role: PersonRole;
  email: string;
  name: string;
  tenantName: string;
  canSpend: boolean;
}

export interface TenantChoice {
  tenantId: string;
  tenantName: string;
}

export const selectTenantBodySchema = z.object({
  tenantId: entityIdSchema,
});
export type SelectTenantBody = z.infer<typeof selectTenantBodySchema>;
