import { z } from "zod";
import { isoDateSchema } from "@/types/forecast/forecast.types";
import { isValidIanaTimezone } from "@/lib/utils/iana-timezone";
import { isSafePaydayRrule } from "@/lib/utils/rrule-guard";

export const tenantTypeSchema = z.enum(["individual", "household", "organization"]);
export type TenantType = z.infer<typeof tenantTypeSchema>;

/**
 * Create body. A single payday sends `rrule`; "twice a month" sends `rrules`
 * (one monthly rule per chosen day). Both normalize to `rrules`.
 */
export const createTenantBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    tenantType: tenantTypeSchema,
    ownerEmail: z.string().email(),
    ownerName: z.string().trim().min(1).max(100),
    timezone: z
      .string()
      .min(1)
      .default("America/New_York")
      .refine(isValidIanaTimezone, { message: "Invalid IANA timezone" }),
    paydayAmountCents: z.number().int().positive().max(99_999_999_99),
    nextPayday: isoDateSchema,
    rrule: z.string().min(1).max(200).optional(),
    rrules: z.array(z.string().min(1).max(200)).min(1).max(4).optional(),
  })
  .refine((body) => body.rrule !== undefined || body.rrules !== undefined, {
    message: "Provide rrule or rrules",
    path: ["rrules"],
  })
  .superRefine((body, ctx) => {
    const rules = body.rrules ?? (body.rrule ? [body.rrule] : []);
    for (const [index, rule] of rules.entries()) {
      if (!isSafePaydayRrule(rule)) {
        ctx.addIssue({
          code: "custom",
          path: body.rrules ? ["rrules", index] : ["rrule"],
          message: "Unsupported recurrence",
        });
      }
    }
  })
  .transform(({ rrule, rrules, ...rest }) => ({
    ...rest,
    rrules: rrules ?? (rrule ? [rrule] : []),
  }));

export type CreateTenantBody = z.input<typeof createTenantBodySchema>;
export type CreateTenantInput = z.output<typeof createTenantBodySchema>;

export interface CreateTenantResult {
  tenantId: string;
  userId: string;
}
