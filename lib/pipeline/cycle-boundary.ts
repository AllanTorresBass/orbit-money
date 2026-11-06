import type { PoolClient } from "pg";
import { DateTime } from "luxon";
import { RRule, rrulestr } from "rrule";
import { addDays } from "@/lib/calendar/dates";
import { effectiveInflowDate } from "@/lib/calendar/inflow-dates";
import {
  byMonthDayFromRrule,
  clampDayInMonth,
  monthEndMonthlyDay,
  nextClampedMonthlyDate,
} from "@/lib/calendar/month-clamp";
import { sweepDiscretionaryAtCycleEnd } from "@/lib/engines/waterfall";
import { logger } from "@/lib/logger";
import { fromCents, toCents } from "@/lib/money/numeric";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

export interface StoredSweepMove {
  envelopeId: string;
  amountCents: number;
  applied: boolean;
}

function toRRuleDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function toIsoDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISODate() ?? "";
}

function parseStoredMoves(raw: unknown): StoredSweepMove[] {
  if (!Array.isArray(raw)) return [];
  const moves: StoredSweepMove[] = [];
  for (const item of raw) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("envelopeId" in item) ||
      !("amountCents" in item)
    ) {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.envelopeId !== "string" || typeof row.amountCents !== "number") {
      continue;
    }
    moves.push({
      envelopeId: row.envelopeId,
      amountCents: row.amountCents,
      applied: row.applied === true,
    });
  }
  return moves;
}

/** True when today is the last day of the pay cycle (next inflow is tomorrow). */
export function isCycleEndDay(today: string, nextPayday: string | null): boolean {
  if (!nextPayday) return false;
  return nextPayday === addDays(today, 1);
}

/**
 * Move leftover discretionary into sinking funds (D6).
 * Inserts a pending sweep row with the planned moves JSONB, applies each move
 * once (marking it applied), then marks the row applied.
 * Retries resume from stored moves — never recompute a full plan from
 * post-move balances. Applied rows are no-ops that report stored incomplete.
 */
export async function applyCycleEndSweep(
  client: PoolClient,
  input: {
    tenantId: string;
    cycleEndDate: string;
    discretionary: EnvelopeState;
    envelopes: EnvelopeState[];
  },
): Promise<{
  sweptCents: number;
  incomplete: boolean;
  discretionaryBalanceCents: number;
  /** True when there was no Goal to receive the leftover, so nothing moved. */
  skippedNoSink: boolean;
}> {
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
      skippedNoSink: true,
    };
  }

  const existing = await client.query<{
    amount: string;
    incomplete: boolean;
    status: string;
    moves: unknown;
  }>(
    `SELECT amount::text, incomplete, status, moves
     FROM cycle_sweeps
     WHERE tenant_id = $1 AND cycle_end_date = $2::date
     FOR UPDATE`,
    [input.tenantId, input.cycleEndDate],
  );

  if (existing.rows[0]?.status === "applied") {
    logger.info("Cycle sweep already applied", {
      tenantId: input.tenantId,
      cycleEndDate: input.cycleEndDate,
    });
    return {
      sweptCents: 0,
      incomplete: existing.rows[0].incomplete,
      discretionaryBalanceCents: input.discretionary.currentBalanceCents,
      skippedNoSink: false,
    };
  }

  let moves: StoredSweepMove[];
  let incomplete: boolean;
  let leftoverCents: number;
  let totalCents: number;
  let discApplied = false;

  if (!existing.rows[0]) {
    const plan = sweepDiscretionaryAtCycleEnd({
      discretionaryBalanceCents: input.discretionary.currentBalanceCents,
      discretionaryId: input.discretionary.id,
      sinkingEnvelopes: sinks,
      sweepEnvelopeId: input.discretionary.sweepEnvelopeId,
    });
    moves = plan.moves.map((m) => ({
      envelopeId: m.envelopeId,
      amountCents: m.amountCents,
      applied: false,
    }));
    incomplete = plan.incomplete;
    leftoverCents = plan.leftoverCents;
    totalCents = moves.reduce((sum, m) => sum + m.amountCents, 0);

    await client.query(
      `INSERT INTO cycle_sweeps
         (tenant_id, cycle_end_date, amount, destination_envelope_id, incomplete, status, moves)
       VALUES ($1, $2::date, $3, $4, $5, 'pending', $6::jsonb)`,
      [
        input.tenantId,
        input.cycleEndDate,
        fromCents(totalCents),
        destinationId,
        incomplete,
        JSON.stringify({ items: moves, discApplied: false, leftoverCents }),
      ],
    );
  } else {
    // Resume from the stored plan — do not recompute from current balances.
    const payload = existing.rows[0].moves;
    const record =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : { items: payload };
    moves = parseStoredMoves(record.items ?? payload);
    leftoverCents =
      typeof record.leftoverCents === "number"
        ? record.leftoverCents
        : Math.max(
            0,
            input.discretionary.currentBalanceCents -
              moves.filter((m) => !m.applied).reduce((s, m) => s + m.amountCents, 0),
          );
    incomplete = existing.rows[0].incomplete;
    totalCents = moves.reduce((sum, m) => sum + m.amountCents, 0);
    discApplied = record.discApplied === true;

    // Already finished the envelope moves but crashed before status flip.
    if (
      moves.every((m) => m.applied) &&
      (discApplied || totalCents === 0) &&
      input.discretionary.currentBalanceCents <= leftoverCents
    ) {
      await client.query(
        `UPDATE cycle_sweeps
         SET status = 'applied'
         WHERE tenant_id = $1 AND cycle_end_date = $2::date`,
        [input.tenantId, input.cycleEndDate],
      );
      return {
        sweptCents: totalCents,
        incomplete,
        discretionaryBalanceCents: input.discretionary.currentBalanceCents,
        skippedNoSink: false,
      };
    }
  }

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    if (move.applied) continue;
    await client.query(
      `UPDATE envelopes
       SET current_balance = current_balance + $1
       WHERE id = $2 AND tenant_id = $3`,
      [fromCents(move.amountCents), move.envelopeId, input.tenantId],
    );
    moves[i] = { ...move, applied: true };
    await client.query(
      `UPDATE cycle_sweeps
       SET moves = $1::jsonb
       WHERE tenant_id = $2 AND cycle_end_date = $3::date AND status = 'pending'`,
      [
        JSON.stringify({ items: moves, discApplied, leftoverCents }),
        input.tenantId,
        input.cycleEndDate,
      ],
    );
  }

  if (totalCents > 0 && !discApplied) {
    await client.query(
      `UPDATE envelopes
       SET current_balance = current_balance - $1
       WHERE id = $2 AND tenant_id = $3`,
      [fromCents(totalCents), input.discretionary.id, input.tenantId],
    );
    discApplied = true;
    await client.query(
      `UPDATE cycle_sweeps
       SET moves = $1::jsonb
       WHERE tenant_id = $2 AND cycle_end_date = $3::date AND status = 'pending'`,
      [
        JSON.stringify({ items: moves, discApplied: true, leftoverCents }),
        input.tenantId,
        input.cycleEndDate,
      ],
    );
  }

  await client.query(
    `UPDATE cycle_sweeps
     SET status = 'applied', incomplete = $1, amount = $2,
         moves = $3::jsonb
     WHERE tenant_id = $4 AND cycle_end_date = $5::date`,
    [
      incomplete,
      fromCents(totalCents),
      JSON.stringify({ items: moves, discApplied: true, leftoverCents }),
      input.tenantId,
      input.cycleEndDate,
    ],
  );

  logger.info("Cycle sweep applied", {
    tenantId: input.tenantId,
    cycleEndDate: input.cycleEndDate,
    sweptCents: totalCents,
    incomplete,
    moveCount: moves.length,
  });

  return {
    sweptCents: totalCents,
    incomplete,
    discretionaryBalanceCents: leftoverCents,
    skippedNoSink: false,
  };
}

/**
 * Midnight: advance outflow schedules due today.
 * Inflows advance only when a matching deposit already settled today (D8).
 * `holidays` moves an inflow's due day to the prior business day (D11).
 */
export async function advanceMidnightDueDates(
  client: PoolClient,
  tenantId: string,
  today: string,
  settledInflowToday: boolean,
  holidays: Set<string> | null = null,
): Promise<{ outflows: number; inflows: number }> {
  const outflows = await advanceMatchingSchedules(client, tenantId, today, "outflow", holidays);
  const inflows = settledInflowToday
    ? await advanceMatchingSchedules(client, tenantId, today, "inflow", holidays)
    : 0;
  return { outflows, inflows };
}

/** @deprecated Prefer advanceMidnightDueDates or advanceInflowsDueToday. */
export async function advanceDueDates(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<number> {
  return advanceMatchingSchedules(client, tenantId, today, null, null);
}

/**
 * After a payday inflow settles, advance inflow schedules due today so N_p
 * counts forward to the following payday (D8).
 */
export async function advanceInflowsDueToday(
  client: PoolClient,
  tenantId: string,
  today: string,
  holidays: Set<string> | null = null,
): Promise<number> {
  return advanceMatchingSchedules(client, tenantId, today, "inflow", holidays);
}

/** Furthest a business-day shift can pull an inflow earlier than its stored date. */
const MAX_INFLOW_SHIFT_DAYS = 6;

async function advanceMatchingSchedules(
  client: PoolClient,
  tenantId: string,
  today: string,
  direction: "inflow" | "outflow" | null,
  holidays: Set<string> | null,
): Promise<number> {
  // An inflow stored on a weekend is paid earlier, so look a few days past today and
  // keep only rows whose business-day date has arrived.
  const reach = holidays && direction !== "outflow" ? addDays(today, MAX_INFLOW_SHIFT_DAYS) : today;
  const schedules = await client.query<{
    id: string;
    direction: "inflow" | "outflow";
    next_due_date: string;
    recurrence_rrule: string;
  }>(
    direction === null
      ? `SELECT id, direction, next_due_date::text, recurrence_rrule
         FROM scheduled_schedules
         WHERE tenant_id = $1 AND is_active = TRUE AND next_due_date <= $2::date`
      : `SELECT id, direction, next_due_date::text, recurrence_rrule
         FROM scheduled_schedules
         WHERE tenant_id = $1 AND is_active = TRUE AND next_due_date <= $2::date
           AND direction = $3`,
    direction === null ? [tenantId, reach] : [tenantId, reach, direction],
  );

  let advanced = 0;
  for (const row of schedules.rows) {
    const dueOn =
      row.direction === "inflow" ? effectiveInflowDate(row.next_due_date, holidays) : row.next_due_date;
    if (dueOn > today) continue;
    if (await advanceRow(client, tenantId, row, today)) advanced += 1;
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

async function advanceRow(
  client: PoolClient,
  tenantId: string,
  row: { id: string; next_due_date: string; recurrence_rrule: string },
  today: string,
): Promise<boolean> {
  // Never move a date back: step past the later of today and the stored due date.
  const after = row.next_due_date > today ? row.next_due_date : today;
  const next = nextOccurrenceAfter(row.next_due_date, row.recurrence_rrule, after);
  if (!next || next <= after) return false;
  await client.query(
    `UPDATE scheduled_schedules SET next_due_date = $1::date WHERE id = $2 AND tenant_id = $3`,
    [next, row.id, tenantId],
  );
  return true;
}

/**
 * Advance one named schedule after its money moved (a deposit or a bill payment).
 * Used when the person says which schedule a transaction settles. Returns false when
 * the schedule is missing, inactive, or has no later occurrence.
 */
export async function advanceScheduleById(
  client: PoolClient,
  tenantId: string,
  scheduleId: string,
  today: string,
): Promise<boolean> {
  const result = await client.query<{
    id: string;
    next_due_date: string;
    recurrence_rrule: string;
  }>(
    `SELECT id, next_due_date::text, recurrence_rrule
     FROM scheduled_schedules
     WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
     FOR UPDATE`,
    [scheduleId, tenantId],
  );
  const row = result.rows[0];
  if (!row) return false;
  const advanced = await advanceRow(client, tenantId, row, today);
  if (advanced) {
    logger.info("Advanced named schedule", { tenantId, scheduleId, today });
  }
  return advanced;
}

export function nextOccurrenceAfter(
  currentDue: string,
  recurrenceRrule: string,
  today: string,
): string | null {
  const ruleText = recurrenceRrule.trim().toUpperCase().startsWith("RRULE:")
    ? recurrenceRrule.trim()
    : `RRULE:${recurrenceRrule.trim()}`;

  const byMonthDay = byMonthDayFromRrule(ruleText);
  const monthEndDay = monthEndMonthlyDay(ruleText);

  // D11 — month-end bills clamp into short months instead of skipping them (rrule skips Feb).
  if (monthEndDay !== null) {
    if (currentDue > today) {
      const [y, m] = currentDue.split("-").map(Number);
      return clampDayInMonth(y, m, monthEndDay) || currentDue;
    }
    let cursor = currentDue;
    for (let i = 0; i < 24; i += 1) {
      const next = nextClampedMonthlyDate(cursor, monthEndDay);
      if (!next) break;
      if (next > today) return next;
      if (next <= cursor) break;
      cursor = next;
    }
    return null;
  }

  try {
    const rule = rrulestr(ruleText, { dtstart: toRRuleDate(currentDue) }) as RRule;
    const after = rule.after(toRRuleDate(today), false);
    if (after) return toIsoDate(after);
  } catch (error: unknown) {
    logger.info("RRULE parse fell back to monthly clamp", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  const fallback = nextClampedMonthlyDate(currentDue, byMonthDay ?? undefined);
  return fallback && fallback > today ? fallback : null;
}

/** Exported for tests that inspect pending sweep rows. */
export function parseSweepAmountCents(amount: string): number {
  return toCents(amount);
}
