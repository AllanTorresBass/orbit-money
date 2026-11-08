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

/** Stored in the form as -1. RRULE reads `BYMONTHDAY=-1` as the last day of each month. */
export const LAST_DAY_OF_MONTH = -1;

/** Days offered for monthly paydays. 1 to 28 so every month has them. */
export const PAYDAY_DAY_OPTIONS = Array.from({ length: 28 }, (_, index) => index + 1);

export interface PaydayDayChoice {
  value: number;
  label: string;
}

/** 1 to 28, then "Last day" for months of any length. */
export const PAYDAY_DAY_CHOICES: PaydayDayChoice[] = [
  ...PAYDAY_DAY_OPTIONS.map((day) => ({ value: day, label: String(day) })),
  { value: LAST_DAY_OF_MONTH, label: "Last day" },
];

/** Zod messages are catalog keys under `create.*`, resolved in the Create UI. */
export const paydayDaySchema = z
  .number()
  .int()
  .refine((day) => day === LAST_DAY_OF_MONTH || (day >= 1 && day <= 28), "pickDay");

export const createSpaceFormSchema = z
  .object({
    name: z.string().trim().min(1, "nameRequired").max(100),
    tenantType: z.enum(["individual", "household", "organization"]),
    cadence: z.enum(CADENCES),
    nextPayday: isoDateSchema,
    amount: z.string().refine((value) => {
      const cents = parseDollarsToCents(value);
      return cents !== null && cents > 0;
    }, "amountRequired"),
    firstDay: paydayDaySchema,
    secondDay: paydayDaySchema,
    monthDay: paydayDaySchema,
  })
  .refine((form) => form.cadence !== "Twice a month" || form.firstDay !== form.secondDay, {
    message: "twoDifferentDays",
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
  monthDay: 1,
};
