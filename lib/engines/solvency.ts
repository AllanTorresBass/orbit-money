import { ceilCents } from "@/lib/money/cents";
import { projectCashflow, type ForecastDay } from "@/lib/engines/forecast";

export interface MitigationResult {
  rateCents: number;
  series: ForecastDay[];
  alert: { firstBreachDate: string; gapCents: number } | null;
  cutsApplied: number;
}

/**
 * Breach cuts only the discretionary burn, at most twice (D14).
 * Prefer `reprojectWithRate` so variable payday burn stays consistent with the pipeline.
 */
export function mitigateBreach(input: {
  series: ForecastDay[];
  rateCents: number;
  cMinCents: number;
  today: string;
  addDays: (iso: string, days: number) => string;
  eventsByDate: Record<string, { inflowCents: number; outflowCents: number }>;
  c0Cents: number;
  /** When set, rebuild the full series for a cut rate (variable burn). */
  reprojectWithRate?: (nextRateCents: number) => ForecastDay[];
}): MitigationResult {
  let rate = input.rateCents;
  let series = input.series;
  let cuts = 0;

  const reproject =
    input.reprojectWithRate ??
    ((nextRate: number): ForecastDay[] =>
      projectCashflow({
        c0Cents: input.c0Cents,
        today: input.today,
        addDays: input.addDays,
        eventsByDate: input.eventsByDate,
        burnForDay: (dayOffset) => (dayOffset === 0 ? 0 : nextRate),
        cMinCents: input.cMinCents,
      }));

  while (cuts < 2) {
    const breaches = series.filter((d) => d.dayOffset >= 1 && d.status === "breach");
    if (breaches.length === 0) {
      return { rateCents: rate, series, alert: null, cutsApplied: cuts };
    }

    const minDay = series
      .filter((d) => d.dayOffset >= 1)
      .reduce((best, d) => (d.balanceCents < best.balanceCents ? d : best));

    if (minDay.balanceCents >= input.cMinCents) {
      return { rateCents: rate, series, alert: null, cutsApplied: cuts };
    }

    const k = minDay.dayOffset;
    const gap = input.cMinCents - minDay.balanceCents;
    rate = Math.max(0, rate - ceilCents(gap / k));
    series = reproject(rate);
    cuts += 1;

    if (rate === 0) {
      const still = series.find((d) => d.dayOffset >= 1 && d.status === "breach");
      return {
        rateCents: 0,
        series,
        alert: still
          ? {
              firstBreachDate: still.forecastDate,
              gapCents: input.cMinCents - still.balanceCents,
            }
          : null,
        cutsApplied: cuts,
      };
    }
  }

  const still = series.find((d) => d.dayOffset >= 1 && d.status === "breach");
  return {
    rateCents: rate,
    series,
    alert: still
      ? {
          firstBreachDate: still.forecastDate,
          gapCents: input.cMinCents - still.balanceCents,
        }
      : null,
    cutsApplied: cuts,
  };
}
