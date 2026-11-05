import { splitDailyRate } from "@/lib/money/cents";

export interface RateComputation {
  sDailyCents: number;
  remainderCents: number;
  openingAllowanceCents: number;
  sTodayCents: number;
  spendableCents: number;
}

export function computeDailyRate(input: {
  discretionaryBalanceCents: number;
  oUnfundedCents: number;
  nP: number | null;
  eDiscActualCents?: number;
}): RateComputation | null {
  if (input.nP === null || input.nP < 1) {
    return null;
  }
  const spendableCents = Math.max(0, input.discretionaryBalanceCents - input.oUnfundedCents);
  const { daily, remainder } = splitDailyRate(spendableCents, input.nP);
  const opening = daily + remainder;
  const spent = input.eDiscActualCents ?? 0;
  return {
    sDailyCents: daily,
    remainderCents: remainder,
    openingAllowanceCents: opening,
    sTodayCents: opening - spent,
    spendableCents,
  };
}

/** Future burn used on forecast days after today (D7). */
export function futureBurnCents(input: {
  sDailyCents: number;
  sTodayCents: number;
  discretionaryBalanceCents: number;
  daysAfterToday: number;
}): number {
  if (input.sTodayCents >= 0) {
    return input.sDailyCents;
  }
  if (input.daysAfterToday < 1) {
    return 0;
  }
  return Math.floor(Math.max(0, input.discretionaryBalanceCents) / input.daysAfterToday);
}
