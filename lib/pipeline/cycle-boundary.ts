import type { PoolClient } from "pg";
import { DateTime } from "luxon";
import { RRule, rrulestr } from "rrule";
import { addDays } from "@/lib/calendar/dates";
import { sweepDiscretionaryAtCycleEnd } from "@/lib/engines/waterfall";
import { logger } from "@/lib/logger";
import { fromCents } from "@/lib/money/numeric";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

function toRRuleDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function toIsoDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISODate() ?? "";
}

/** True when today is the last day of the pay cycle (next inflow is tomorrow). */
export function isCycleEndDay(today: string, nextPayday: string | null): boolean {
  if (!nextPayday) return false;
  return nextPayday === addDays(today, 1);
}

/**
 * Move leftover discretionary into sinking funds (D6). Idempotent via cycle_sweeps.
 * Returns discretionary balance cents after the sweep.
 */
export async function applyCycleEndSweep(
  client: PoolClient,
  input: {
    tenantId: string;
    cycleEndDate: string;
    discretionary: EnvelopeState;
    envelopes: EnvelopeState[];
  },
): Promise<{ sweptCents: number; incomplete: boolean; discretionaryBalanceCents: number }> {
  const sinks = input.envelopes.filter((e) => e.tierCategory === "sinking");
  const destinationId =
    input.discretionary.sweepEnvelopeId ??
    [...sinks].sort((a, b) => a.priorityOrder - b.priorityOrder)[0]?.id;

  if (!destinationId) {
    logger.info("Cycle sweep skipped — no sinking destination", {
      tenantId: input.tenantId,
      cycleEndDate: input.cycleEndDate,
    });
    return {
      sweptCents: 0,
      incomplete: input.discretionary.currentBalanceCents > 0,
      discretionaryBalanceCents: input.discretionary.currentBalanceCents,
    };
  }

  const plan = sweepDiscretionaryAtCycleEnd({
    discretionaryBalanceCents: input.discretionary.currentBalanceCents,
    discretionaryId: input.discretionary.id,
    sinkingEnvelopes: sinks,
    sweepEnvelopeId: input.discretionary.sweepEnvelopeId,
  });
  const totalCents = plan.moves.reduce((sum, m) => sum + m.amountCents, 0);

  const inserted = await client.query<{ tenant_id: string }>(
    `INSERT INTO cycle_sweeps (tenant_id, cycle_end_date, amount, destination_envelope_id, incomplete)
     VALUES ($1, $2::date, $3, $4, $5)
     ON CONFLICT (tenant_id, cycle_end_date) DO NOTHING
     RETURNING tenant_id`,
    [input.tenantId, input.cycleEndDate, fromCents(totalCents), destinationId, plan.incomplete],
  );

  if (inserted.rows.length === 0) {
    logger.info("Cycle sweep already applied", {
      tenantId: input.tenantId,
      cycleEndDate: input.cycleEndDate,
    });
    return {
      sweptCents: 0,
      incomplete: false,
      discretionaryBalanceCents: input.discretionary.currentBalanceCents,
    };
  }

  for (const move of plan.moves) {
    await client.query(
      `UPDATE envelopes
       SET current_balance = current_balance + $1
       WHERE id = $2 AND tenant_id = $3`,
      [fromCents(move.amountCents), move.envelopeId, input.tenantId],
    );
  }

  if (totalCents > 0) {
    await client.query(
      `UPDATE envelopes
       SET current_balance = current_balance - $1
       WHERE id = $2 AND tenant_id = $3`,
      [fromCents(totalCents), input.discretionary.id, input.tenantId],
    );
  }

  logger.info("Cycle sweep applied", {
    tenantId: input.tenantId,
    cycleEndDate: input.cycleEndDate,
    sweptCents: totalCents,
    incomplete: plan.incomplete,
    moveCount: plan.moves.length,
  });

  return {
    sweptCents: totalCents,
    incomplete: plan.incomplete,
    discretionaryBalanceCents: plan.leftoverCents,
  };
}

/** Advance next_due_date for schedules whose due date is today or earlier. */
export async function advanceDueDates(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<number> {
  return advanceMatchingSchedules(client, tenantId, today, null);
}

/**
 * After a payday inflow settles, advance inflow schedules due today so N_p
 * counts forward to the following payday (D8).
 */
export async function advanceInflowsDueToday(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<number> {
  return advanceMatchingSchedules(client, tenantId, today, "inflow");
}

async function advanceMatchingSchedules(
  client: PoolClient,
  tenantId: string,
  today: string,
  direction: "inflow" | "outflow" | null,
): Promise<number> {
  const schedules = await client.query<{
    id: string;
    next_due_date: string;
    recurrence_rrule: string;
  }>(
    direction === null
      ? `SELECT id, next_due_date::text, recurrence_rrule
         FROM scheduled_schedules
         WHERE tenant_id = $1 AND is_active = TRUE AND next_due_date <= $2::date`
      : `SELECT id, next_due_date::text, recurrence_rrule
         FROM scheduled_schedules
         WHERE tenant_id = $1 AND is_active = TRUE AND next_due_date <= $2::date
           AND direction = $3`,
    direction === null ? [tenantId, today] : [tenantId, today, direction],
  );

  let advanced = 0;
  for (const row of schedules.rows) {
    const next = nextOccurrenceAfter(row.next_due_date, row.recurrence_rrule, today);
    if (!next || next <= today) continue;
    await client.query(
      `UPDATE scheduled_schedules SET next_due_date = $1::date WHERE id = $2 AND tenant_id = $3`,
      [next, row.id, tenantId],
    );
    advanced += 1;
  }

  if (advanced > 0) {
    logger.info("Advanced schedule due dates", {
      tenantId,
      today,
      advanced,
      direction: direction ?? "all",
    });
  }
  return advanced;
}

function nextOccurrenceAfter(
  currentDue: string,
  recurrenceRrule: string,
  today: string,
): string | null {
  const ruleText = recurrenceRrule.trim().toUpperCase().startsWith("RRULE:")
    ? recurrenceRrule.trim()
    : `RRULE:${recurrenceRrule.trim()}`;

  try {
    const rule = rrulestr(ruleText, { dtstart: toRRuleDate(currentDue) }) as RRule;
    const after = rule.after(toRRuleDate(today), false);
    if (after) return toIsoDate(after);
  } catch {
    // fall through to monthly bump
  }

  const fallback = DateTime.fromISO(currentDue, { zone: "utc" }).plus({ months: 1 }).toISODate();
  return fallback && fallback > today ? fallback : null;
}
