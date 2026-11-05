import { z } from "zod";
import { isoDateSchema } from "@/types/forecast/forecast.types";
import { parseDollarsToCents } from "@/lib/utils/money-input";

export const CADENCES = [
  "Every week",
  "Every two weeks",
  "Twice a month",
  "Every month",
  "Once a year",
] as const;
export type Cadence = (typeof CADENCES)[number];

/** Days offered for monthly paydays. 1 to 28 so every month has them. */
export const PAYDAY_DAY_OPTIONS = Array.from({ length: 28 }, (_, index) => index + 1);

export const createSpaceFormSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(100),
    tenantType: z.enum(["individual", "household", "organization"]),
    cadence: z.enum(CADENCES),
    nextPayday: isoDateSchema,
    amount: z.string().refine((value) => {
      const cents = parseDollarsToCents(value);
      return cents !== null && cents > 0;
    }, "Enter a payday amount"),
    firstDay: z.number().int().min(1).max(28),
    secondDay: z.number().int().min(1).max(28),
  })
  .refine((form) => form.cadence !== "Twice a month" || form.firstDay !== form.secondDay, {
    message: "Pick two different days",
    path: ["secondDay"],
  });

export type CreateSpaceForm = z.infer<typeof createSpaceFormSchema>;

export const createSpaceDefaults: CreateSpaceForm = {
  name: "Harbor",
  tenantType: "household",
  cadence: "Every two weeks",
  nextPayday: "2026-11-18",
  amount: "3000",
  firstDay: 1,
  secondDay: 15,
};
