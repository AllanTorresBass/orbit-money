export type ForecastStatus = "ok" | "warning" | "breach";

export interface ForecastDay {
  dayOffset: number;
  forecastDate: string;
  balanceCents: number;
  inflowCents: number;
  scheduledOutflowCents: number;
  assumedBurnCents: number;
  status: ForecastStatus;
}

export interface DatedCashEvent {
  date: string;
  inflowCents: number;
  outflowCents: number;
  /** When an inflow lands, optional new burn for subsequent days. */
  burnAfterInflowCents?: number;
}

export function classifyDay(
  balanceCents: number,
  cMinCents: number,
  burnCents: number,
): ForecastStatus {
  if (balanceCents < cMinCents) {
    return "breach";
  }
  const warningBand = cMinCents + Math.floor(1.5 * burnCents);
  if (balanceCents < warningBand) {
    return "warning";
  }
  return "ok";
}

/**
 * Project aggregate cash for τ = 0…60.
 * C(0) is not charged the daily burn again (D9).
 */
export function projectCashflow(input: {
  c0Cents: number;
  today: string;
  addDays: (iso: string, days: number) => string;
  eventsByDate: Record<string, { inflowCents: number; outflowCents: number }>;
  burnForDay: (dayOffset: number, date: string) => number;
  cMinCents: number;
  horizon?: number;
}): ForecastDay[] {
  const H = input.horizon ?? 60;
  const days: ForecastDay[] = [];
  let cash = input.c0Cents;
  let currentBurn = input.burnForDay(0, input.today);

  for (let τ = 0; τ <= H; τ += 1) {
    const date = input.addDays(input.today, τ);
    const events = input.eventsByDate[date] ?? { inflowCents: 0, outflowCents: 0 };
    let assumedBurn = 0;

    if (τ === 0) {
      // Opening cash already includes today's posted activity; do not burn again.
      cash = cash + events.inflowCents - events.outflowCents;
    } else {
      assumedBurn = input.burnForDay(τ, date);
      currentBurn = assumedBurn;
      cash = cash + events.inflowCents - events.outflowCents - assumedBurn;
    }

    days.push({
      dayOffset: τ,
      forecastDate: date,
      balanceCents: cash,
      inflowCents: events.inflowCents,
      scheduledOutflowCents: events.outflowCents,
      assumedBurnCents: assumedBurn,
      status: classifyDay(cash, input.cMinCents, currentBurn),
    });
  }

  return days;
}
