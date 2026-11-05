import type { PoolClient } from "pg";
import { addDays, daysBetween, daysUntilNextInflow, todayInTimezone } from "@/lib/calendar/dates";
import { expandSchedules } from "@/lib/calendar/expand-schedules";
import { getHolidaySet } from "@/lib/calendar/holidays";
import { projectCashflow } from "@/lib/engines/forecast";
import { computeDailyRate, futureBurnCents } from "@/lib/engines/safe-to-spend";
import { mitigateBreach } from "@/lib/engines/solvency";
import { absorbDebit, allocateInflow } from "@/lib/engines/waterfall";
import { logger } from "@/lib/logger";
import { fromCents, toCents } from "@/lib/money/numeric";
import { splitDailyRate } from "@/lib/money/cents";
import type { EnvelopeState } from "@/types/envelope/envelope.types";

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

export async function runEvaluationPipeline(
  client: PoolClient,
  input: PipelineInput,
): Promise<{ sTodayCents: number | null; sDailyCents: number | null }> {
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

  // Step 3 — settle unsettled transactions
  if (input.transactionId) {
    await settleTransaction(client, input.tenantId, input.transactionId, today);
  } else {
    const unsettled = await client.query<{ id: string }>(
      `SELECT id FROM transactions
       WHERE tenant_id = $1 AND settled_at IS NULL
       ORDER BY booked_at ASC`,
      [input.tenantId],
    );
    for (const row of unsettled.rows) {
      await settleTransaction(client, input.tenantId, row.id, today);
    }
  }

  const envelopes = await loadEnvelopes(client, input.tenantId);
  const discretionary = envelopes.find((e) => e.tierCategory === "discretionary");
  if (!discretionary) {
    throw new Error("Missing discretionary envelope");
  }

  const nextInflowRes = await client.query<{ next_due_date: string }>(
    `SELECT next_due_date::text AS next_due_date
     FROM scheduled_schedules
     WHERE tenant_id = $1 AND is_active = TRUE AND direction = 'inflow'
       AND next_due_date >= $2::date
     ORDER BY next_due_date ASC
     LIMIT 1`,
    [input.tenantId, today],
  );
  const nextPayday = nextInflowRes.rows[0]?.next_due_date ?? null;
  const nP = daysUntilNextInflow({ today, nextInflow: nextPayday });

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

  // Morning rate uses balance before today's disc spend for opening; D7 uses current B_disc for overspend burn.
  const rate = computeDailyRate({
    discretionaryBalanceCents: discretionary.currentBalanceCents + eDiscActualCents,
    oUnfundedCents: 0,
    nP,
    eDiscActualCents,
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
    holidays = new Set([
      ...getHolidaySet(tenant.holiday_region, 2026),
      ...getHolidaySet(tenant.holiday_region, 2027),
    ]);
  } catch (error: unknown) {
    logger.error("Holiday calendar missing; keeping previous forecast", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      sTodayCents: rate?.sTodayCents ?? null,
      sDailyCents: rate?.sDailyCents ?? null,
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

  /** Approximate post-payday burn from the inflow amount when a full in-memory waterfall is not yet projected. */
  const burnAfterPayday = (paydayIso: string): number => {
    const inflow = eventsByDate[paydayIso]?.inflowCents ?? 0;
    const idx = paydayDates.indexOf(paydayIso);
    const next = paydayDates[idx + 1] ?? addDays(paydayIso, 14);
    const cycleDays = Math.max(1, daysBetween(paydayIso, next));
    // Typical Harbor residual after bills/goals ≈ inflow − 150000 when funded; use 53% of inflow as a floor estimate.
    const estimatedDisc = Math.max(0, Math.floor(inflow * 0.5));
    return splitDailyRate(estimatedDisc, cycleDays).daily;
  };

  const burnForDay = (dayOffset: number, date: string): number => {
    if (dayOffset === 0) return 0;
    const priorPaydays = paydayDates.filter((p) => p <= date && p > today);
    if (priorPaydays.length === 0) return burn;
    const lastPayday = priorPaydays[priorPaydays.length - 1];
    if (date === lastPayday) {
      return burnAfterPayday(lastPayday);
    }
    return burnAfterPayday(lastPayday);
  };

  let series = projectCashflow({
    c0Cents,
    today,
    addDays,
    eventsByDate,
    burnForDay,
    cMinCents,
  });

  let mitigated = false;
  let publishedDaily = rate?.sDailyCents ?? 0;
  let publishedToday = rate?.sTodayCents ?? 0;

  if (rate) {
    const mitigation = mitigateBreach({
      series,
      rateCents: burn,
      cMinCents,
      today,
      addDays,
      eventsByDate,
      c0Cents,
    });
    series = mitigation.series;
    if (mitigation.cutsApplied > 0) {
      mitigated = true;
      publishedDaily = mitigation.rateCents;
      if (rate.sTodayCents >= 0) {
        publishedToday = mitigation.rateCents + rate.remainderCents - eDiscActualCents;
      }
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

  if (rate && nP !== null) {
    await client.query(
      `INSERT INTO allowance_snapshots
         (tenant_id, as_of_date, s_daily, s_today, n_p, o_unfunded, mitigated, next_payday, computed_at)
       VALUES ($1, $2::date, $3, $4, $5, 0, $6, $7::date, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         as_of_date = EXCLUDED.as_of_date,
         s_daily = EXCLUDED.s_daily,
         s_today = EXCLUDED.s_today,
         n_p = EXCLUDED.n_p,
         mitigated = EXCLUDED.mitigated,
         next_payday = EXCLUDED.next_payday,
         computed_at = NOW()`,
      [
        input.tenantId,
        today,
        fromCents(publishedDaily),
        fromCents(publishedToday),
        nP,
        mitigated,
        nextPayday,
      ],
    );
  }

  logger.info("Pipeline complete", {
    tenantId: input.tenantId,
    trigger: input.trigger,
    sTodayCents: publishedToday,
    mitigated,
  });

  return { sTodayCents: rate ? publishedToday : null, sDailyCents: rate ? publishedDaily : null };
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
  if (txn.settled_at) return;

  const amountCents = toCents(txn.amount);
  const envelopes = await loadEnvelopes(client, tenantId);

  if (amountCents > 0) {
    // Inflow waterfall
    const dueAmountByEnvelopeId: Record<string, number> = {};
    for (const e of envelopes.filter((x) => x.tierCategory === "fixed")) {
      const dueRes = await client.query<{ due: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS due
         FROM scheduled_schedules
         WHERE tenant_id = $1 AND envelope_id = $2 AND is_active = TRUE
           AND direction = 'outflow' AND next_due_date >= $3::date`,
        [tenantId, e.id, today],
      );
      const scheduleDue = toCents(dueRes.rows[0]?.due ?? "0");
      dueAmountByEnvelopeId[e.id] =
        scheduleDue > 0 ? scheduleDue : (e.targetCapCents ?? 0);
    }

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
}
