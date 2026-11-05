import type { PoolClient } from "pg";
import { DateTime } from "luxon";
import { RRule, rrulestr } from "rrule";
import { addDays, daysUntilNextInflow, parseISODate, todayInTimezone } from "@/lib/calendar/dates";
import { expandSchedules } from "@/lib/calendar/expand-schedules";
import { getHolidaySet } from "@/lib/calendar/holidays";
import { buildDueAmountByEnvelopeId, type ScheduleDueRow } from "@/lib/engines/due-amounts";
import { projectCashflow } from "@/lib/engines/forecast";
import { buildProjectedBurnByDate } from "@/lib/engines/projected-burn";
import { computeDailyRate, futureBurnCents } from "@/lib/engines/safe-to-spend";
import { mitigateBreach } from "@/lib/engines/solvency";
import { computeUnfundedCents } from "@/lib/engines/unfunded";
import { absorbDebit, allocateInflow } from "@/lib/engines/waterfall";
import { logger } from "@/lib/logger";
import { fromCents, toCents } from "@/lib/money/numeric";
import {
  advanceDueDates,
  advanceInflowsDueToday,
  applyCycleEndSweep,
  isCycleEndDay,
} from "@/lib/pipeline/cycle-boundary";
import { emitPipelineStep } from "@/lib/pipeline/telemetry";
import type { EnvelopeState } from "@/types/envelope/envelope.types";
import type { PipelineRunSummary } from "@/types/pipeline/pipeline.types";

export type { PipelineRunSummary };

export interface PipelineInput {
  tenantId: string;
  userId: string;
  trigger: "sync" | "midnight";
  transactionId?: string;
  asOfDate?: string;
}

function mapEnvelope(row: {
  id: string;
  name: string;
  tier_category: string;
  priority_order: number;
  current_balance: string;
  target_cap: string | null;
  monthly_installment: string | null;
  rollover_policy: string;
  sweep_envelope_id: string | null;
}): EnvelopeState {
  return {
    id: row.id,
    name: row.name,
    tierCategory: row.tier_category as EnvelopeState["tierCategory"],
    priorityOrder: row.priority_order,
    currentBalanceCents: toCents(row.current_balance),
    targetCapCents: row.target_cap === null ? null : toCents(row.target_cap),
    monthlyInstallmentCents:
      row.monthly_installment === null ? null : toCents(row.monthly_installment),
    rolloverPolicy: row.rollover_policy as EnvelopeState["rolloverPolicy"],
    sweepEnvelopeId: row.sweep_envelope_id,
  };
}

async function loadEnvelopes(client: PoolClient, tenantId: string): Promise<EnvelopeState[]> {
  const result = await client.query(
    `SELECT id, name, tier_category, priority_order, current_balance, target_cap,
            monthly_installment, rollover_policy, sweep_envelope_id
     FROM envelopes WHERE tenant_id = $1`,
    [tenantId],
  );
  return result.rows.map(mapEnvelope);
}

async function loadScheduleDueRows(
  client: PoolClient,
  tenantId: string,
): Promise<ScheduleDueRow[]> {
  const result = await client.query<{
    envelope_id: string | null;
    amount: string;
    next_due_date: string;
    direction: string;
  }>(
    `SELECT envelope_id, amount::text, next_due_date::text, direction
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE`,
    [tenantId],
  );
  return result.rows.map((s) => ({
    envelopeId: s.envelope_id,
    amountCents: toCents(s.amount),
    nextDueDate: s.next_due_date,
    direction: s.direction as "inflow" | "outflow",
    isActive: true,
  }));
}

async function nextInflowDate(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<string | null> {
  const result = await client.query<{ next_due_date: string }>(
    `SELECT next_due_date::text AS next_due_date
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE AND direction = 'inflow'
       AND next_due_date > $2::date
     ORDER BY next_due_date ASC
     LIMIT 1`,
    [tenantId, today],
  );
  if (result.rows[0]?.next_due_date) {
    return result.rows[0].next_due_date;
  }
  const todayInflow = await client.query<{ next_due_date: string }>(
    `SELECT next_due_date::text AS next_due_date
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE AND direction = 'inflow'
       AND next_due_date = $2::date
     LIMIT 1`,
    [tenantId, today],
  );
  return todayInflow.rows[0]?.next_due_date ?? null;
}

async function hasSettledInflowToday(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM transactions
     WHERE tenant_id = $1
       AND booked_date = $2::date
       AND amount > 0
       AND settled_at IS NOT NULL
     LIMIT 1`,
    [tenantId, today],
  );
  return result.rows.length > 0;
}

/** Following payday after `today`, using RRULE when today's inflow is still anchored. */
async function peekFollowingInflow(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<string | null> {
  const future = await client.query<{ next_due_date: string }>(
    `SELECT next_due_date::text AS next_due_date
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE AND direction = 'inflow'
       AND next_due_date > $2::date
     ORDER BY next_due_date ASC
     LIMIT 1`,
    [tenantId, today],
  );
  if (future.rows[0]?.next_due_date) {
    return future.rows[0].next_due_date;
  }

  const current = await client.query<{ next_due_date: string; recurrence_rrule: string }>(
    `SELECT next_due_date::text, recurrence_rrule
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE AND direction = 'inflow'
       AND next_due_date <= $2::date
     ORDER BY next_due_date DESC
     LIMIT 1`,
    [tenantId, today],
  );
  const row = current.rows[0];
  if (!row) return null;

  const ruleText = row.recurrence_rrule.trim().toUpperCase().startsWith("RRULE:")
    ? row.recurrence_rrule.trim()
    : `RRULE:${row.recurrence_rrule.trim()}`;
  const [y, m, d] = today.split("-").map(Number);
  const afterDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const [dy, dm, dd] = row.next_due_date.split("-").map(Number);
  try {
    const rule = rrulestr(ruleText, {
      dtstart: new Date(Date.UTC(dy, dm - 1, dd, 12, 0, 0)),
    }) as RRule;
    const after = rule.after(afterDate, false);
    if (after) {
      return DateTime.fromJSDate(after, { zone: "utc" }).toISODate();
    }
  } catch {
    // fall through
  }
  return DateTime.fromISO(row.next_due_date, { zone: "utc" }).plus({ months: 1 }).toISODate();
}

function holidayYearsForHorizon(today: string, horizonDays: number): number[] {
  const startYear = parseISODate(today).year;
  const endYear = parseISODate(addDays(today, horizonDays)).year;
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y += 1) {
    years.push(y);
  }
  return years;
}

export async function runEvaluationPipeline(
  client: PoolClient,
  input: PipelineInput,
): Promise<PipelineRunSummary> {
  const tenantRes = await client.query<{
    timezone: string;
    holiday_region: string;
    liquidity_floor: string;
  }>(`SELECT timezone, holiday_region, liquidity_floor FROM tenants WHERE id = $1`, [
    input.tenantId,
  ]);
  const tenant = tenantRes.rows[0];
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const today = input.asOfDate ?? todayInTimezone(tenant.timezone);
  const cMinCents = toCents(tenant.liquidity_floor);
  const runStarted = Date.now();

  // Step 1 — settle unsettled transactions
  const settleStarted = Date.now();
  let settleCount = 0;
  if (input.transactionId) {
    await settleTransaction(client, input.tenantId, input.transactionId, today);
    settleCount = 1;
  } else {
    const unsettled = await client.query<{ id: string }>(
      `SELECT id FROM transactions
       WHERE tenant_id = $1 AND settled_at IS NULL
       ORDER BY booked_at ASC`,
      [input.tenantId],
    );
    for (const row of unsettled.rows) {
      await settleTransaction(client, input.tenantId, row.id, today);
      settleCount += 1;
    }
  }
  emitPipelineStep({
    trigger: input.trigger,
    tenantId: input.tenantId,
    asOfDate: today,
    step: "settle",
    centsIn: settleCount,
    durationMs: Date.now() - settleStarted,
  });

  let envelopes = await loadEnvelopes(client, input.tenantId);
  let discretionary = envelopes.find((e) => e.tierCategory === "discretionary");
  if (!discretionary) {
    throw new Error("Missing discretionary envelope");
  }

  const peekNextPayday = await nextInflowDate(client, input.tenantId, today);

  // Midnight-only cycle boundary (module 8): sweep on the last day, then advance dues.
  if (input.trigger === "midnight") {
    if (isCycleEndDay(today, peekNextPayday)) {
      logger.info("Pipeline cycle end", {
        tenantId: input.tenantId,
        today,
        nextPayday: peekNextPayday,
        discCents: discretionary.currentBalanceCents,
      });
      await applyCycleEndSweep(client, {
        tenantId: input.tenantId,
        cycleEndDate: today,
        discretionary,
        envelopes,
      });
      envelopes = await loadEnvelopes(client, input.tenantId);
      discretionary = envelopes.find((e) => e.tierCategory === "discretionary");
      if (!discretionary) {
        throw new Error("Missing discretionary envelope");
      }
    }
    await advanceDueDates(client, input.tenantId, today);
  }

  let nextPayday = await nextInflowDate(client, input.tenantId, today);
  const settledInflowToday = await hasSettledInflowToday(client, input.tenantId, today);

  // D8 — payday today and not yet settled → N_p = 1; after settle, schedules already advanced.
  const inflowIsTodayAndUnsettled = nextPayday === today && !settledInflowToday;
  const nP = daysUntilNextInflow({
    today,
    nextInflow: nextPayday,
    inflowIsTodayAndUnsettled,
  });

  const spentTodayRes = await client.query<{ spent: string }>(
    `SELECT COALESCE(SUM(ABS(amount)), 0)::text AS spent
     FROM transactions
     WHERE tenant_id = $1
       AND envelope_id = $2
       AND booked_date = $3::date
       AND amount < 0
       AND settled_at IS NOT NULL`,
    [input.tenantId, discretionary.id, today],
  );
  const eDiscActualCents = toCents(spentTodayRes.rows[0]?.spent ?? "0");

  const scheduleRows = await loadScheduleDueRows(client, input.tenantId);
  // For O_unfunded and dues: when payday is today and unsettled, the window ends at today
  // (nothing after today is "before next inflow" in the half-open sense of N_p=1).
  const dueWindowEnd = inflowIsTodayAndUnsettled ? today : nextPayday;
  const oUnfundedCents = computeUnfundedCents({
    envelopes,
    schedules: scheduleRows,
    today,
    nextInflow: dueWindowEnd,
  });
  const dueAmountByEnvelopeId = buildDueAmountByEnvelopeId({
    envelopes,
    schedules: scheduleRows,
    today,
    nextInflow: dueWindowEnd,
  });

  // Morning rate uses balance before today's disc spend for opening; D7 uses current B_disc for overspend burn.
  const rate = computeDailyRate({
    discretionaryBalanceCents: discretionary.currentBalanceCents + eDiscActualCents,
    oUnfundedCents,
    nP,
    eDiscActualCents,
  });

  emitPipelineStep({
    trigger: input.trigger,
    tenantId: input.tenantId,
    asOfDate: today,
    step: "rate",
    nP,
    oUnfundedCents,
    sDailyCents: rate?.sDailyCents ?? null,
    sTodayCents: rate?.sTodayCents ?? null,
    centsIn: discretionary.currentBalanceCents,
    centsOut: eDiscActualCents,
  });

  const cashRes = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(current_balance), 0)::text AS total FROM accounts WHERE tenant_id = $1`,
    [input.tenantId],
  );
  const c0Cents = toCents(cashRes.rows[0]?.total ?? "0");

  const schedules = await client.query<{
    amount: string;
    direction: string;
    next_due_date: string;
    recurrence_rrule: string;
  }>(
    `SELECT amount::text, direction, next_due_date::text, recurrence_rrule
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE`,
    [input.tenantId],
  );

  let holidays: Set<string>;
  try {
    const years = holidayYearsForHorizon(today, 60);
    holidays = new Set(years.flatMap((year) => [...getHolidaySet(tenant.holiday_region, year)]));
  } catch (error: unknown) {
    logger.error("Holiday calendar missing; keeping previous forecast", {
      tenantId: input.tenantId,
      error: error instanceof Error ? error.message : "unknown",
    });
    await client.query(
      `UPDATE allowance_snapshots
       SET forecast_stale = TRUE, computed_at = NOW()
       WHERE tenant_id = $1`,
      [input.tenantId],
    );
    emitPipelineStep({
      trigger: input.trigger,
      tenantId: input.tenantId,
      asOfDate: today,
      step: "publish",
      nP,
      oUnfundedCents,
      sDailyCents: rate?.sDailyCents ?? null,
      sTodayCents: rate?.sTodayCents ?? null,
      forecastStale: true,
      durationMs: Date.now() - runStarted,
    });
    return {
      sTodayCents: rate?.sTodayCents ?? null,
      sDailyCents: rate?.sDailyCents ?? null,
      oUnfundedCents,
      nP,
      mitigated: false,
      forecastStale: true,
      cutsApplied: 0,
    };
  }

  const { eventsByDate, paydayDates } = expandSchedules({
    schedules: schedules.rows.map((s) => ({
      amount: s.amount,
      direction: s.direction as "inflow" | "outflow",
      nextDueDate: s.next_due_date,
      recurrenceRrule: s.recurrence_rrule,
    })),
    today,
    holidays,
  });

  const daysAfterToday = nP === null ? 0 : Math.max(0, nP - 1);
  const burn = rate
    ? futureBurnCents({
        sDailyCents: rate.sDailyCents,
        sTodayCents: rate.sTodayCents,
        discretionaryBalanceCents: discretionary.currentBalanceCents,
        daysAfterToday,
      })
    : 0;

  const horizonDates = Array.from({ length: 61 }, (_, i) => addDays(today, i));
  const futurePaydays = paydayDates.filter((d) => d > today);

  const buildBurnByDate = (initialBurnCents: number): Record<string, number> =>
    buildProjectedBurnByDate({
      today,
      dates: horizonDates,
      initialBurnCents,
      envelopes,
      dueAmountByEnvelopeId,
      eventsByDate,
      paydayDates: futurePaydays,
    });

  let burnByDate = buildBurnByDate(burn);

  const burnForDay = (dayOffset: number, date: string): number => {
    if (dayOffset === 0) return 0;
    return burnByDate[date] ?? burn;
  };

  const projectStarted = Date.now();
  let series = projectCashflow({
    c0Cents,
    today,
    addDays,
    eventsByDate,
    burnForDay,
    cMinCents,
  });
  emitPipelineStep({
    trigger: input.trigger,
    tenantId: input.tenantId,
    asOfDate: today,
    step: "project",
    centsIn: burn,
    durationMs: Date.now() - projectStarted,
  });

  let mitigated = false;
  let cutsApplied = 0;
  let publishedDaily = rate?.sDailyCents ?? 0;
  let publishedToday = rate?.sTodayCents ?? 0;
  let breachDate: string | null = null;
  let gapCents: number | null = null;

  const firstBreach = series.find((d) => d.dayOffset >= 1 && d.status === "breach");
  emitPipelineStep({
    trigger: input.trigger,
    tenantId: input.tenantId,
    asOfDate: today,
    step: "floor_check",
    breachDate: firstBreach?.forecastDate ?? null,
    gapCents: firstBreach ? cMinCents - firstBreach.balanceCents : null,
  });

  if (rate) {
    const mitigation = mitigateBreach({
      series,
      rateCents: burn,
      cMinCents,
      today,
      addDays,
      eventsByDate,
      c0Cents,
      reprojectWithRate: (nextRateCents) => {
        burnByDate = buildBurnByDate(nextRateCents);
        return projectCashflow({
          c0Cents,
          today,
          addDays,
          eventsByDate,
          burnForDay: (dayOffset, date) => {
            if (dayOffset === 0) return 0;
            return burnByDate[date] ?? nextRateCents;
          },
          cMinCents,
        });
      },
    });
    series = mitigation.series;
    cutsApplied = mitigation.cutsApplied;
    breachDate = mitigation.alert?.firstBreachDate ?? null;
    gapCents = mitigation.alert?.gapCents ?? null;
    if (mitigation.cutsApplied > 0) {
      mitigated = true;
      publishedDaily = mitigation.rateCents;
      if (rate.sTodayCents >= 0) {
        publishedToday = mitigation.rateCents + rate.remainderCents - eDiscActualCents;
      }
      emitPipelineStep({
        trigger: input.trigger,
        tenantId: input.tenantId,
        asOfDate: today,
        step: "cut",
        cutsApplied: mitigation.cutsApplied,
        centsOut: mitigation.rateCents,
        breachDate,
        gapCents,
      });
    }
  }

  await client.query(`DELETE FROM forecast_days WHERE tenant_id = $1`, [input.tenantId]);
  for (const day of series) {
    await client.query(
      `INSERT INTO forecast_days
         (tenant_id, day_offset, forecast_date, balance, inflow, scheduled_outflow, assumed_burn, status)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8)`,
      [
        input.tenantId,
        day.dayOffset,
        day.forecastDate,
        fromCents(day.balanceCents),
        fromCents(day.inflowCents),
        fromCents(day.scheduledOutflowCents),
        fromCents(day.assumedBurnCents),
        day.status,
      ],
    );
  }

  // Refresh next payday after any in-settle advance for snapshot display.
  nextPayday = await nextInflowDate(client, input.tenantId, today);

  if (rate && nP !== null) {
    await client.query(
      `INSERT INTO allowance_snapshots
         (tenant_id, as_of_date, s_daily, s_today, n_p, o_unfunded, mitigated, next_payday, forecast_stale, computed_at)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8::date, FALSE, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         as_of_date = EXCLUDED.as_of_date,
         s_daily = EXCLUDED.s_daily,
         s_today = EXCLUDED.s_today,
         n_p = EXCLUDED.n_p,
         o_unfunded = EXCLUDED.o_unfunded,
         mitigated = EXCLUDED.mitigated,
         next_payday = EXCLUDED.next_payday,
         forecast_stale = FALSE,
         computed_at = NOW()`,
      [
        input.tenantId,
        today,
        fromCents(publishedDaily),
        fromCents(publishedToday),
        nP,
        fromCents(oUnfundedCents),
        mitigated,
        nextPayday,
      ],
    );
  }

  emitPipelineStep({
    trigger: input.trigger,
    tenantId: input.tenantId,
    asOfDate: today,
    step: "publish",
    nP,
    oUnfundedCents,
    sDailyCents: rate ? publishedDaily : null,
    sTodayCents: rate ? publishedToday : null,
    cutsApplied,
    breachDate,
    gapCents,
    forecastStale: false,
    durationMs: Date.now() - runStarted,
  });

  return {
    sTodayCents: rate ? publishedToday : null,
    sDailyCents: rate ? publishedDaily : null,
    oUnfundedCents,
    nP,
    mitigated,
    forecastStale: false,
    cutsApplied,
  };
}

async function settleTransaction(
  client: PoolClient,
  tenantId: string,
  transactionId: string,
  today: string,
): Promise<void> {
  const txnRes = await client.query<{
    id: string;
    amount: string;
    envelope_id: string | null;
    account_id: string;
    settled_at: string | null;
    booked_date: string;
  }>(
    `SELECT id, amount::text, envelope_id, account_id, settled_at::text, booked_date::text
     FROM transactions WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [transactionId, tenantId],
  );
  const txn = txnRes.rows[0];
  if (!txn) return;
  if (txn.settled_at) {
    logger.info("Settlement skipped — already settled", {
      tenantId,
      transactionId,
    });
    return;
  }

  const amountCents = toCents(txn.amount);
  const envelopes = await loadEnvelopes(client, tenantId);
  const scheduleRows = await loadScheduleDueRows(client, tenantId);

  if (amountCents > 0) {
    // Waterfall funds bills before the following payday (after this deposit).
    let dueWindowEnd = await nextInflowDate(client, tenantId, today);
    if (dueWindowEnd === today || dueWindowEnd === null) {
      dueWindowEnd = await peekFollowingInflow(client, tenantId, today);
    }

    const dueAmountByEnvelopeId = buildDueAmountByEnvelopeId({
      envelopes,
      schedules: scheduleRows,
      today,
      nextInflow: dueWindowEnd,
    });

    const result = allocateInflow({
      inflowCents: amountCents,
      envelopes,
      dueAmountByEnvelopeId,
    });

    for (const a of result.allocations) {
      await client.query(
        `UPDATE envelopes SET current_balance = current_balance + $1
         WHERE id = $2 AND tenant_id = $3`,
        [fromCents(a.amountCents), a.envelopeId, tenantId],
      );
      await client.query(
        `INSERT INTO allocations (tenant_id, transaction_id, envelope_id, amount)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (transaction_id, envelope_id) DO NOTHING`,
        [tenantId, transactionId, a.envelopeId, fromCents(a.amountCents)],
      );
    }
  } else if (amountCents < 0) {
    const debit = -amountCents;
    const envelope = envelopes.find((e) => e.id === txn.envelope_id);
    if (!envelope) {
      throw new Error("Debit requires an envelope");
    }
    const absorbed = absorbDebit(
      envelope.currentBalanceCents,
      debit,
      envelope.tierCategory === "discretionary",
    );
    await client.query(
      `UPDATE envelopes SET current_balance = current_balance + $1
       WHERE id = $2 AND tenant_id = $3`,
      [fromCents(absorbed.envelopeDeltaCents), envelope.id, tenantId],
    );
    if (absorbed.deficitAllocationCents > 0) {
      const disc = envelopes.find((e) => e.tierCategory === "discretionary");
      if (!disc) throw new Error("Missing discretionary envelope");
      await client.query(
        `UPDATE envelopes SET current_balance = current_balance + $1
         WHERE id = $2 AND tenant_id = $3`,
        [fromCents(absorbed.discretionaryDeltaCents), disc.id, tenantId],
      );
      await client.query(
        `INSERT INTO allocations (tenant_id, transaction_id, envelope_id, amount)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, transactionId, disc.id, fromCents(absorbed.deficitAllocationCents)],
      );
    }
  }

  await client.query(
    `UPDATE transactions SET settled_at = NOW() WHERE id = $1 AND tenant_id = $2`,
    [transactionId, tenantId],
  );

  // D8 — after payday settles, count forward to the following inflow.
  if (amountCents > 0 && txn.booked_date === today) {
    await advanceInflowsDueToday(client, tenantId, today);
  }
}
