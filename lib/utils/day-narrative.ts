import { formatMoney } from "@/lib/utils";
import type { ForecastDayDetailDto } from "@/types/forecast/forecast.types";

/** One sentence that explains a single day in plain words. */
export function dayNarrative(
  day: Pick<
    ForecastDayDetailDto,
    "inflowCents" | "scheduledOutflowCents" | "status" | "keepAtLeastCents"
  >,
): string {
  const hasInflow = day.inflowCents > 0;
  const hasOutflow = day.scheduledOutflowCents > 0;

  const event =
    hasInflow && hasOutflow
      ? "Payday arrives and bills leave the bank"
      : hasInflow
        ? "Payday arrives"
        : hasOutflow
          ? "Bills leave the bank"
          : "Only everyday spending happens";

  const keep = formatMoney(day.keepAtLeastCents);
  if (day.status === "breach") {
    return `${event}, and the bank ends the day below the ${keep} you want to keep.`;
  }
  if (day.status === "warning") {
    return `${event}, and the bank ends the day close to the ${keep} you want to keep.`;
  }
  return `${event}.`;
}
