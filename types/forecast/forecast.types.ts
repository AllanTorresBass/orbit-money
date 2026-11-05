import { z } from "zod";

export const forecastStatusSchema = z.enum(["ok", "warning", "breach"]);
export type ForecastStatus = z.infer<typeof forecastStatusSchema>;

/** Calendar date `YYYY-MM-DD` that also exists on the calendar. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Invalid calendar date");

export const forecastDateParamSchema = z.object({
  date: isoDateSchema,
});
export type ForecastDateParam = z.infer<typeof forecastDateParamSchema>;

export interface ForecastDayDto {
  dayOffset: number;
  forecastDate: string;
  balanceCents: number;
  inflowCents: number;
  scheduledOutflowCents: number;
  assumedBurnCents: number;
  status: ForecastStatus;
}

/** One forecast day plus the amount the household asked to keep. */
export interface ForecastDayDetailDto extends ForecastDayDto {
  keepAtLeastCents: number;
}

export interface ForecastListResponse {
  days: ForecastDayDto[];
}
