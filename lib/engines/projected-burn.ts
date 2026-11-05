import { daysBetween } from "@/lib/calendar/dates";
import { allocateInflow } from "@/lib/engines/waterfall";
import { splitDailyRate } from "@/lib/money/cents";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

/**
 * Build per-day discretionary burn across the horizon.
 * On each future payday, run an in-memory waterfall and floor-divide the new
 * discretionary pool by days until the following payday (D9 / module 3).
 */
export function buildProjectedBurnByDate(input: {
  today: string;
  dates: string[];
  initialBurnCents: number;
  envelopes: EnvelopeState[];
  dueAmountByEnvelopeId: Record<string, number>;
  eventsByDate: Record<string, { inflowCents: number; outflowCents: number }>;
  paydayDates: string[];
}): Record<string, number> {
  const balances = new Map(input.envelopes.map((e) => [e.id, e.currentBalanceCents]));
  const disc = input.envelopes.find((e) => e.tierCategory === "discretionary");
  if (!disc) {
    return Object.fromEntries(input.dates.map((d) => [d, input.initialBurnCents]));
  }

  let currentBurn = input.initialBurnCents;
  const burnByDate: Record<string, number> = {};

  for (const date of input.dates) {
    if (date === input.today) {
      burnByDate[date] = 0;
      continue;
    }

    const events = input.eventsByDate[date] ?? { inflowCents: 0, outflowCents: 0 };

    if (events.outflowCents > 0) {
      const fixed = input.envelopes
        .filter((e) => e.tierCategory === "fixed")
        .sort((a, b) => a.priorityOrder - b.priorityOrder);
      let remainingOut = events.outflowCents;
      for (const e of fixed) {
        if (remainingOut <= 0) break;
        const bal = balances.get(e.id) ?? 0;
        const take = Math.min(bal, remainingOut);
        balances.set(e.id, bal - take);
        remainingOut -= take;
      }
    }

    if (events.inflowCents > 0 && input.paydayDates.includes(date)) {
      const projectedEnvelopes = input.envelopes.map((e) => ({
        ...e,
        currentBalanceCents: balances.get(e.id) ?? e.currentBalanceCents,
      }));
      const result = allocateInflow({
        inflowCents: events.inflowCents,
        envelopes: projectedEnvelopes,
        dueAmountByEnvelopeId: input.dueAmountByEnvelopeId,
      });
      for (const [id, bal] of Object.entries(result.balancesAfter)) {
        balances.set(id, bal);
      }

      const idx = input.paydayDates.indexOf(date);
      const nextPayday = input.paydayDates[idx + 1];
      const nP = nextPayday ? Math.max(1, daysBetween(date, nextPayday)) : 14;
      const discBal = balances.get(disc.id) ?? 0;
      currentBurn = splitDailyRate(Math.max(0, discBal), nP).daily;
    }

    burnByDate[date] = currentBurn;

    // Draw the projected burn from the discretionary pool so the next payday
    // residual is not stacked on an undepleted balance.
    if (currentBurn > 0) {
      const discBal = balances.get(disc.id) ?? 0;
      balances.set(disc.id, discBal - currentBurn);
    }
  }

  return burnByDate;
}
