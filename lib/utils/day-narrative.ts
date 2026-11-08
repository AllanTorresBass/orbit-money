import type { ForecastDayDetailDto } from "@/types/forecast/forecast.types";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** One sentence that explains a single day in plain words. */
export function dayNarrative(
  day: Pick<
    ForecastDayDetailDto,
    "inflowCents" | "scheduledOutflowCents" | "status" | "keepAtLeastCents"
  >,
  formatMoney: (cents: number) => string,
  t: Translate,
): string {
  const hasInflow = day.inflowCents > 0;
  const hasOutflow = day.scheduledOutflowCents > 0;

  const event =
    hasInflow && hasOutflow
      ? t("eventBoth")
      : hasInflow
        ? t("eventInflow")
        : hasOutflow
          ? t("eventOutflow")
          : t("eventNone");

  const keep = formatMoney(day.keepAtLeastCents);
  if (day.status === "breach") {
    return t("narrativeBreach", { event, amount: keep });
  }
  if (day.status === "warning") {
    return t("narrativeWarning", { event, amount: keep });
  }
  return t("narrativeOk", { event });
}
