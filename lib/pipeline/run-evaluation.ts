import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DateTime } from "luxon";
import { addDays, daysUntilNextInflow, todayInTimezone } from "@/lib/calendar/dates";
import { expandSchedules } from "@/lib/calendar/expand-schedules";
import {
  effectiveInflowDate,
  loadTenantHolidays,
  matchesScheduledAmount,
  pickNextInflowDate,
} from "@/lib/calendar/inflow-dates";
import { lockTenantForUpdate } from "@/lib/db/advisory-lock";
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
  advanceInflowsDueToday,
  advanceMidnightDueDates,
  advanceScheduleById,
  applyCycleEndSweep,
  isCycleEndDay,
  nextOccurrenceAfter,
} from "@/lib/pipeline/cycle-boundary";
import { pickReasonCode } from "@/lib/pipeline/reason-code";
import {
  finishPipelineRun,
  persistFailedPipelineRun,
  recordPipelineStep,
  startPipelineRun,
  type PipelineRunContext,
} from "@/lib/pipeline/telemetry";
import type { EnvelopeState } from "@/types/envelope/envelope.types";
import type { PipelineRunSummary, ScheduleSourceRow } from "@/types/pipeline/pipeline.types";

export type { PipelineRunSummary };

export interface PipelineInput {
  tenantId: string;
  userId: string;
  trigger: "sync" | "midnight";
  transactionId?: string;
  asOfDate?: string;
  cronBatchId?: string;
  /** Run id from `beginPipelineRun`. A fresh id is made when absent. */
  runId?: string;
  /** True when `runId` was already committed on its own connection before this transaction. */
  runPreStarted?: boolean;
  /** The inflow or outflow schedule the settling transaction pays. Advanced when it settles. */
  advanceScheduleId?: string;
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
     FROM envelopes WHERE tenant_id = $1 AND archived_at IS NULL`,
    [tenantId],
  );
  return result.rows.map(mapEnvelope);
}

/** One load of active schedules, including the RRULE, for both due amounts and expansion. */
async function loadScheduleRows(
  client: PoolClient,
  tenantId: string,
): Promise<ScheduleSourceRow[]> {
  const result = await client.query<{
    envelope_id: string | null;
    amount: string;
    next_due_date: string;
    direction: string;
    recurrence_rrule: string;
  }>(
    `SELECT envelope_id, amount::text, next_due_date::text, direction, recurrence_rrule
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE`,
    [tenantId],
  );
  return result.rows.map((s) => ({
    envelopeId: s.envelope_id,
    amount: s.amount,
    nextDueDate: s.next_due_date,
    direction: s.direction as "inflow" | "outflow",
    recurrenceRrule: s.recurrence_rrule,
  }));
}

function toScheduleDueRows(rows: ScheduleSourceRow[]): ScheduleDueRow[] {
  return rows.map((s) => ({
    envelopeId: s.envelopeId,
    amountCents: toCents(s.amount),
    nextDueDate: s.nextDueDate,
    direction: s.direction,
    isActive: true,
  }));
}

interface InflowScheduleRow {
  next_due_date: string;
  recurrence_rrule: string;
  amount: string;
}

async function loadInflowSchedules(
  client: PoolClient,
  tenantId: string,
): Promise<InflowScheduleRow[]> {
  const result = await client.query<InflowScheduleRow>(
    `SELECT next_due_date::text AS next_due_date, recurrence_rrule, amount::text AS amount
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE AND direction = 'inflow'`,
    [tenantId],
  );
  return result.rows;
}

/** Next payday on the business-day calendar (D11). A Saturday payday is Friday. */
async function nextInflowDate(
  client: PoolClient,
  tenantId: string,
  today: string,
  holidays: Set<string> | null,
): Promise<string | null> {
  const rows = await loadInflowSchedules(client, tenantId);
  return pickNextInflowDate(
    rows.map((r) => r.next_due_date),
    today,
    holidays,
  );
}

/** D8 — payday settled only when a credit matches an active inflow due today. */
async function hasSettledInflowToday(
  client: PoolClient,
  tenantId: string,
  today: string,
  holidays: Set<string> | null,
): Promise<boolean> {
  const credits = await client.query<{ amount: string }>(
    `SELECT amount::text
     FROM transactions
     WHERE tenant_id = $1
       AND booked_date = $2::date
       AND amount > 0
       AND settled_at IS NOT NULL`,
    [tenantId, today],
  );
  if (credits.rows.length === 0) return false;
  const schedules = await loadInflowSchedules(client, tenantId);
  return schedules.some(
    (s) =>
      effectiveInflowDate(s.next_due_date, holidays) === today &&
      credits.rows.some((c) => matchesScheduledAmount(toCents(c.amount), toCents(s.amount))),
  );
}

/** The payday after the one a schedule row stands for, on the business-day calendar. */
function followingInflowOf(
  row: Pick<InflowScheduleRow, "next_due_date" | "recurrence_rrule">,
  today: string,
  holidays: Set<string> | null,
): string {
  // Step past the later of today and the stored date, so a weekend payday never maps to itself.
  const after = row.next_due_date > today ? row.next_due_date : today;
  const next =
    nextOccurrenceAfter(row.next_due_date, row.recurrence_rrule, after) ??
    DateTime.fromISO(row.next_due_date, { zone: "utc" }).plus({ months: 1 }).toISODate() ??
    row.next_due_date;
  return effectiveInflowDate(next, holidays);
}

/** Following payday after `today`, using RRULE when today's inflow is still anchored. */
async function peekFollowingInflow(
  client: PoolClient,
  tenantId: string,
  today: string,
  holidays: Set<string> | null,
): Promise<string | null> {
  const rows = await loadInflowSchedules(client, tenantId);
  const future = rows
    .map((r) => effectiveInflowDate(r.next_due_date, holidays))
    .filter((d) => d > today)
    .sort()[0];
  if (future) return future;

  const current = rows
    .filter((r) => effectiveInflowDate(r.next_due_date, holidays) <= today)
    .sort((a, b) => (a.next_due_date < b.next_due_date ? 1 : -1))[0];
  if (!current) return null;
  return followingInflowOf(current, today, holidays);
}

/** The payday after a named schedule's current one. Null when the schedule is unknown. */
async function followingInflowOfSchedule(
  client: PoolClient,
  tenantId: string,
  scheduleId: string,
  today: string,
  holidays: Set<string> | null,
): Promise<string | null> {
  const result = await client.query<InflowScheduleRow>(
    `SELECT next_due_date::text AS next_due_date, recurrence_rrule, amount::text AS amount
     FROM scheduled_schedules
     WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE AND direction = 'inflow'`,
    [scheduleId, tenantId],
  );
  const row = result.rows[0];
  return row ? followingInflowOf(row, today, holidays) : null;
}

/**
 * Spend rate the last cycle published, kept for future days while payday is unsettled.
 * Run history is pruned after 90 days, so when no earlier run is left the snapshot's own
 * rate stands in. Zero only when neither exists.
 */
async function loadPriorCycleBurnCents(
  client: PoolClient,
  tenantId: string,
  today: string,
): Promise<number> {
  const result = await client.query<{ s_daily: string }>(
    `SELECT s_daily::text
     FROM pipeline_runs
     WHERE tenant_id = $1 AND as_of_date < $2::date AND status = 'ok' AND s_daily IS NOT NULL
     ORDER BY as_of_date DESC, started_at DESC
     LIMIT 1`,
    [tenantId, today],
  );
  if (result.rows[0]) return toCents(result.rows[0].s_daily);

  const snapshot = await client.query<{ s_daily: string }>(
    `SELECT s_daily::text FROM allowance_snapshots WHERE tenant_id = $1`,
    [tenantId],
  );
  return snapshot.rows[0] ? toCents(snapshot.rows[0].s_daily) : 0;
}

const SAVEPOINT = "orbit_pipeline_run";

/**
 * Run the six-step evaluation. A thrown error is recorded as an `error` run on its own
 * connection (the caller's transaction rolls back, so the row must commit separately),
 * then rethrown so the transaction still settles once or not at all.
 */
export async function runEvaluationPipeline(
  client: PoolClient,
  input: PipelineInput,
): Promise<PipelineRunSummary> {
  const progress: { ctx: PipelineRunContext | null } = { ctx: null };
  // One money writer per tenant at a time. Taken before the savepoint so a rollback to it keeps the lock.
  await lockTenantForUpdate(client, input.tenantId);
  try {
    return await runEvaluationSteps(client, input, progress);
  } catch (error: unknown) {
    const ctx = progress.ctx;
    if (ctx) {
      try {
        // Undo this run's partial writes and clear an aborted-transaction state.
        await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      } catch (rollbackError: unknown) {
        logger.error("Pipeline savepoint rollback failed", {
          runId: ctx.runId,
          error: rollbackError instanceof Error ? rollbackError.message : "unknown",
        });
      }
      await persistFailedPipelineRun(ctx, { transactionId: input.transactionId, error });
    }
    throw error;
  }
}

async function runEvaluationSteps(
  client: PoolClient,
  input: PipelineInput,
  progress: { ctx: PipelineRunContext | null },
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
  const runId = input.runId ?? randomUUID();
  const ctx: PipelineRunContext = {
    runId,
    tenantId: input.tenantId,
    trigger: input.trigger,
    asOfDate: today,
    cronBatchId: input.cronBatchId,
    triggeredByUserId: input.trigger === "sync" ? input.userId : undefined,
  };

  await client.query(`SAVEPOINT ${SAVEPOINT}`);
  progress.ctx = ctx;
  if (!input.runPreStarted) {
    // Direct callers (tests) get an in-transaction row. Services start it out of band first.
    await startPipelineRun(client, { ctx, transactionId: input.transactionId });
  }

  // Holidays for the business-day calendar. Null means the region has no calendar (fail closed).
  const holidays = loadTenantHolidays(tenant.holiday_region, today);

  let envelopes = await loadEnvelopes(client, input.tenantId);
  let scheduleSource = await loadScheduleRows(client, input.tenantId);
  let scheduleRows = toScheduleDueRows(scheduleSource);

  // Step 1 — settle unsettled transactions. Balances move in memory; one reload after the loop.
  const settleStarted = Date.now();
  let settleCount = 0;
  let idempotencyHit = false;
  const toSettle: string[] = [];
  if (input.transactionId) {
    toSettle.push(input.transactionId);
  } else {
    const unsettled = await client.query<{ id: string }>(
      `SELECT id FROM transactions
       WHERE tenant_id = $1 AND settled_at IS NULL
       ORDER BY booked_at ASC`,
      [input.tenantId],
    );
    for (const row of unsettled.rows) toSettle.push(row.id);
  }
  for (const transactionId of toSettle) {
    const settled = await settleTransaction(client, {
      tenantId: input.tenantId,
      transactionId,
      today,
      envelopes,
      scheduleRows,
      holidays,
      advanceScheduleId:
        input.transactionId === transactionId ? input.advanceScheduleId : undefined,
    });
    if (settled.settled) {
      settleCount += 1;
      envelopes = settled.envelopes;
    }
    if (settled.idempotencyHit) idempotencyHit = true;
  }
  if (settleCount > 0) {
    // Authoritative reload: settlement may have advanced inflow due dates.
    envelopes = await loadEnvelopes(client, input.tenantId);
    scheduleSource = await loadScheduleRows(client, input.tenantId);
    scheduleRows = toScheduleDueRows(scheduleSource);
  }
  await recordPipelineStep(client, ctx, "settle", {
    settledCount: settleCount,
    idempotencyHit,
    durationMs: Date.now() - settleStarted,
  });
  let discretionary = envelopes.find((e) => e.tierCategory === "discretionary");
  if (!discretionary) {
    throw new Error("Missing discretionary envelope");
  }

  const peekNextPayday = await nextInflowDate(client, input.tenantId, today, holidays);
  const settledInflowToday = await hasSettledInflowToday(
    client,
    input.tenantId,
    today,
    holidays,
  );

  // Midnight-only cycle boundary (module 8): sweep on the last day, then advance dues.
  // Never advance unsettled payday inflows (D8).
  let sweepIncomplete = false;
  let sweepSkippedNoSink = false;
  if (input.trigger === "midnight") {
    if (isCycleEndDay(today, peekNextPayday)) {
      logger.info("Pipeline cycle end", {
        tenantId: input.tenantId,
        today,
        nextPayday: peekNextPayday,
        discCents: discretionary.currentBalanceCents,
      });
      const sweepStarted = Date.now();
      const sweep = await applyCycleEndSweep(client, {
        tenantId: input.tenantId,
        cycleEndDate: today,
        discretionary,
        envelopes,
      });
      sweepIncomplete = sweep.incomplete;
      sweepSkippedNoSink = sweep.skippedNoSink;
      envelopes = await loadEnvelopes(client, input.tenantId);
      discretionary = envelopes.find((e) => e.tierCategory === "discretionary");
      if (!discretionary) {
        throw new Error("Missing discretionary envelope");
      }
      await recordPipelineStep(client, ctx, "sweep", {
        centsOut: sweep.sweptCents,
        sweptCents: sweep.sweptCents,
        sweepIncomplete: sweep.incomplete,
        durationMs: Date.now() - sweepStarted,
      });
    }
    const advanceStarted = Date.now();
    const advanced = await advanceMidnightDueDates(
      client,
      input.tenantId,
      today,
      settledInflowToday,
      holidays,
    );
    if (advanced.outflows + advanced.inflows > 0) {
      scheduleSource = await loadScheduleRows(client, input.tenantId);
      scheduleRows = toScheduleDueRows(scheduleSource);
    }
    await recordPipelineStep(client, ctx, "schedule_advance", {
      advancedOutflows: advanced.outflows,
      advancedInflows: advanced.inflows,
      durationMs: Date.now() - advanceStarted,
    });
  }

  let nextPayday = await nextInflowDate(client, input.tenantId, today, holidays);

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

  // Payday morning still funds bills due today through the following payday (exclusive).
  let dueWindowEnd = nextPayday;
  if (inflowIsTodayAndUnsettled) {
    dueWindowEnd =
      (await peekFollowingInflow(client, input.tenantId, today, holidays)) ?? nextPayday;
  }
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
  const rateStarted = Date.now();
  const rate = computeDailyRate({
    discretionaryBalanceCents: discretionary.currentBalanceCents + eDiscActualCents,
    oUnfundedCents,
    nP,
    eDiscActualCents,
  });

  await recordPipelineStep(client, ctx, "rate", {
    nP,
    oUnfundedCents,
    sDailyCents: rate?.sDailyCents ?? null,
    sTodayCents: rate?.sTodayCents ?? null,
    centsIn: discretionary.currentBalanceCents,
    centsOut: eDiscActualCents,
    durationMs: Date.now() - rateStarted,
  });

  const cashRes = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(current_balance), 0)::text AS total FROM accounts WHERE tenant_id = $1`,
    [input.tenantId],
  );
  const c0Cents = toCents(cashRes.rows[0]?.total ?? "0");

  if (holidays === null) {
    logger.error("Holiday calendar missing; keeping previous forecast", {
      tenantId: input.tenantId,
      holidayRegion: tenant.holiday_region,
    });
    const prior = await client.query<{ s_daily: string; s_today: string }>(
      `SELECT s_daily::text, s_today::text FROM allowance_snapshots WHERE tenant_id = $1`,
      [input.tenantId],
    );
    await client.query(
      `UPDATE allowance_snapshots
       SET forecast_stale = TRUE, computed_at = NOW()
       WHERE tenant_id = $1`,
      [input.tenantId],
    );
    const priorDaily = prior.rows[0] ? toCents(prior.rows[0].s_daily) : null;
    const priorToday = prior.rows[0] ? toCents(prior.rows[0].s_today) : null;
    await recordPipelineStep(client, ctx, "publish", {
      nP,
      oUnfundedCents,
      sDailyCents: priorDaily,
      sTodayCents: priorToday,
      forecastStale: true,
      sweepIncomplete,
      durationMs: Date.now() - runStarted,
    });
    await finishPipelineRun(client, {
      runId,
      status: "stale",
      forecastStale: true,
      cutsApplied: 0,
      oUnfundedCents,
      sDailyCents: priorDaily,
      sTodayCents: priorToday,
      nP,
      sweepIncomplete,
      errorCode: "holiday_calendar_missing",
      reasonCode: "holiday_calendar_missing",
      cashCents: c0Cents,
    });
    return {
      runId,
      sTodayCents: priorToday,
      sDailyCents: priorDaily,
      oUnfundedCents,
      nP,
      mitigated: false,
      forecastStale: true,
      cutsApplied: 0,
      sweepIncomplete,
      reasonCode: "holiday_calendar_missing",
    };
  }

  const { eventsByDate, paydayDates } = expandSchedules({
    schedules: scheduleSource,
    today,
    holidays,
  });

  const daysAfterToday = nP === null ? 0 : Math.max(0, nP - 1);
  // Payday morning, before the deposit settles: N_p = 1 makes the pool look like one day of
  // spending. Do not rebase future days on it. Keep the last cycle's rate until settle.
  const holdPriorBurn = inflowIsTodayAndUnsettled;
  const priorCycleBurnCents = holdPriorBurn
    ? await loadPriorCycleBurnCents(client, input.tenantId, today)
    : 0;
  const burn = holdPriorBurn
    ? priorCycleBurnCents
    : rate
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
      schedules: scheduleRows,
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
  await recordPipelineStep(client, ctx, "project", {
    centsIn: burn,
    durationMs: Date.now() - projectStarted,
  });

  let mitigated = false;
  let cutsApplied = 0;
  let publishedDaily = rate?.sDailyCents ?? 0;
  let publishedToday = rate?.sTodayCents ?? 0;
  let breachDate: string | null = null;
  let gapCents: number | null = null;

  const floorStarted = Date.now();
  const firstBreach = series.find((d) => d.dayOffset >= 1 && d.status === "breach");
  await recordPipelineStep(client, ctx, "floor_check", {
    breachDate: firstBreach?.forecastDate ?? null,
    gapCents: firstBreach ? cMinCents - firstBreach.balanceCents : null,
    durationMs: Date.now() - floorStarted,
  });

  if (rate) {
    const cutStarted = Date.now();
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
      if (!holdPriorBurn) {
        publishedDaily = mitigation.rateCents;
        if (rate.sTodayCents >= 0) {
          publishedToday = mitigation.rateCents + rate.remainderCents - eDiscActualCents;
        }
      }
      await recordPipelineStep(client, ctx, "cut", {
        cutsApplied: mitigation.cutsApplied,
        centsOut: mitigation.rateCents,
        breachDate,
        gapCents,
        durationMs: Date.now() - cutStarted,
      });
    }
  }

  await client.query(`DELETE FROM forecast_days WHERE tenant_id = $1`, [input.tenantId]);
  if (series.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;
    for (const day of series) {
      placeholders.push(
        `($${i++}, $${i++}, $${i++}::date, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
      );
      values.push(
        input.tenantId,
        day.dayOffset,
        day.forecastDate,
        fromCents(day.balanceCents),
        fromCents(day.inflowCents),
        fromCents(day.scheduledOutflowCents),
        fromCents(day.assumedBurnCents),
        day.status,
      );
    }
    await client.query(
      `INSERT INTO forecast_days
         (tenant_id, day_offset, forecast_date, balance, inflow, scheduled_outflow, assumed_burn, status)
       VALUES ${placeholders.join(", ")}`,
      values,
    );
  }

  // Refresh next payday after any in-settle advance for snapshot display.
  nextPayday = await nextInflowDate(client, input.tenantId, today, holidays);

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
  } else {
    // No future inflow (D8): publish no rate. Zero out the hero so yesterday's number does not
    // linger, and leave N_p empty rather than invent a day count.
    await client.query(
      `INSERT INTO allowance_snapshots
         (tenant_id, as_of_date, s_daily, s_today, n_p, o_unfunded, mitigated, next_payday, forecast_stale, computed_at)
       VALUES ($1, $2::date, 0.00, 0.00, NULL, $3, FALSE, $4::date, FALSE, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         as_of_date = EXCLUDED.as_of_date,
         s_daily = 0.00,
         s_today = 0.00,
         n_p = NULL,
         o_unfunded = EXCLUDED.o_unfunded,
         mitigated = FALSE,
         next_payday = EXCLUDED.next_payday,
         forecast_stale = FALSE,
         computed_at = NOW()`,
      [input.tenantId, today, fromCents(oUnfundedCents), nextPayday],
    );
  }

  await recordPipelineStep(client, ctx, "publish", {
    nP,
    oUnfundedCents,
    sDailyCents: rate ? publishedDaily : null,
    sTodayCents: rate ? publishedToday : null,
    cutsApplied,
    breachDate,
    gapCents,
    forecastStale: false,
    sweepIncomplete,
    durationMs: Date.now() - runStarted,
  });

  const reasonCode = pickReasonCode({ nP, cutsApplied, breachDate, sweepSkippedNoSink });
  await finishPipelineRun(client, {
    runId,
    status: "ok",
    forecastStale: false,
    cutsApplied,
    oUnfundedCents,
    sDailyCents: rate ? publishedDaily : null,
    sTodayCents: rate ? publishedToday : null,
    nP,
    sweepIncomplete,
    reasonCode,
    cashCents: c0Cents,
  });

  return {
    runId,
    sTodayCents: rate ? publishedToday : null,
    sDailyCents: rate ? publishedDaily : null,
    oUnfundedCents,
    nP,
    mitigated,
    forecastStale: false,
    cutsApplied,
    sweepIncomplete,
    reasonCode,
  };
}

async function settleTransaction(
  client: PoolClient,
  input: {
    tenantId: string;
    transactionId: string;
    today: string;
    envelopes: EnvelopeState[];
    scheduleRows: ScheduleDueRow[];
    holidays: Set<string> | null;
    advanceScheduleId?: string;
  },
): Promise<{ settled: boolean; idempotencyHit: boolean; envelopes: EnvelopeState[] }> {
  const { tenantId, transactionId, today, scheduleRows, holidays, advanceScheduleId } = input;
  // Balances change in memory so the caller reloads once after the loop, not per transaction.
  const balanceDelta = new Map<string, number>();
  const addDelta = (envelopeId: string, cents: number): void => {
    balanceDelta.set(envelopeId, (balanceDelta.get(envelopeId) ?? 0) + cents);
  };
  const withDeltas = (): EnvelopeState[] =>
    input.envelopes.map((e) => ({
      ...e,
      currentBalanceCents: e.currentBalanceCents + (balanceDelta.get(e.id) ?? 0),
    }));
  const envelopes = input.envelopes;
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
  if (!txn) return { settled: false, idempotencyHit: false, envelopes };
  if (txn.settled_at) {
    logger.info("Settlement skipped — already settled", {
      tenantId,
      transactionId,
    });
    return { settled: false, idempotencyHit: true, envelopes };
  }

  const amountCents = toCents(txn.amount);

  if (amountCents > 0) {
    // A named payday funds bills up to the one after it, whether it lands early, today, or late.
    let dueWindowEnd = advanceScheduleId
      ? await followingInflowOfSchedule(client, tenantId, advanceScheduleId, today, holidays)
      : null;
    if (dueWindowEnd === null) {
      dueWindowEnd = await nextInflowDate(client, tenantId, today, holidays);
      if (dueWindowEnd === today || dueWindowEnd === null) {
        dueWindowEnd = await peekFollowingInflow(client, tenantId, today, holidays);
      }
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
      addDelta(a.envelopeId, a.amountCents);
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
    addDelta(envelope.id, absorbed.envelopeDeltaCents);
    await client.query(
      `UPDATE envelopes SET current_balance = current_balance + $1
       WHERE id = $2 AND tenant_id = $3`,
      [fromCents(absorbed.envelopeDeltaCents), envelope.id, tenantId],
    );
    if (absorbed.deficitAllocationCents > 0) {
      const disc = envelopes.find((e) => e.tierCategory === "discretionary");
      if (!disc) throw new Error("Missing discretionary envelope");
      addDelta(disc.id, absorbed.discretionaryDeltaCents);
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

  if (advanceScheduleId) {
    // The person named the schedule this money pays. Advance exactly that one, once.
    await advanceScheduleById(client, tenantId, advanceScheduleId, today);
  } else if (amountCents > 0 && txn.booked_date === today) {
    // D8 — only a credit within a cent of an inflow due today advances the payday.
    const schedules = await loadInflowSchedules(client, tenantId);
    const matches = schedules.some(
      (s) =>
        effectiveInflowDate(s.next_due_date, holidays) === today &&
        matchesScheduledAmount(amountCents, toCents(s.amount)),
    );
    if (matches) {
      await advanceInflowsDueToday(client, tenantId, today, holidays);
    }
  }

  return { settled: true, idempotencyHit: false, envelopes: withDeltas() };
}
