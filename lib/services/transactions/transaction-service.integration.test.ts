import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { ConflictError, ValidationError } from "@/lib/errors/service-errors";
import { toCents } from "@/lib/money/numeric";
import { finishCronBatch, startCronBatch } from "@/lib/pipeline/cron-batch";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { beginPipelineRun, closeAbandonedPipelineRuns } from "@/lib/pipeline/telemetry";
import { withPipelineRun } from "@/lib/pipeline/with-run";
import { transactionService } from "@/lib/services/transactions/TransactionService";

config({ path: ".env" });

const USER_ID = randomUUID();
const createdTenants: string[] = [];

interface TestTenant {
  tenantId: string;
  accountId: string;
  rentId: string;
  spendingId: string;
  paydayScheduleId: string | null;
  rentScheduleId: string;
}

/** An isolated household, so these tests never touch Harbor. */
async function createTenant(options: {
  paydayDue: string | null;
  rentDue: string;
  spendingBalance?: string;
  rentBalance?: string;
}): Promise<TestTenant> {
  const tenantId = randomUUID();
  const accountId = randomUUID();
  const rentId = randomUUID();
  const spendingId = randomUUID();
  const rentScheduleId = randomUUID();
  const paydayScheduleId = options.paydayDue ? randomUUID() : null;
  createdTenants.push(tenantId);
  await withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    await client.query(
      `INSERT INTO tenants (id, name, tenant_type, timezone, holiday_region)
       VALUES ($1, 'WS test', 'household', 'UTC', 'US')`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO accounts (id, tenant_id, name, current_balance, is_everyday)
       VALUES ($1, $2, 'Checking', 1000.00, TRUE)`,
      [accountId, tenantId],
    );
    await client.query(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, target_cap, rollover_policy)
       VALUES ($1, $2, 'Rent', 'fixed', 1, $3, 500.00, 'top_up')`,
      [rentId, tenantId, options.rentBalance ?? "0.00"],
    );
    await client.query(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, rollover_policy)
       VALUES ($1, $2, 'Spending', 'discretionary', 1, $3, 'reset_sweep')`,
      [spendingId, tenantId, options.spendingBalance ?? "100.00"],
    );
    await client.query(
      `INSERT INTO scheduled_schedules
         (id, tenant_id, envelope_id, account_id, title, amount, direction, recurrence_rrule, next_due_date)
       VALUES ($1, $2, $3, $4, 'Rent', 500.00, 'outflow', 'FREQ=MONTHLY', $5::date)`,
      [rentScheduleId, tenantId, rentId, accountId, options.rentDue],
    );
    if (paydayScheduleId && options.paydayDue) {
      await client.query(
        `INSERT INTO scheduled_schedules
           (id, tenant_id, envelope_id, account_id, title, amount, direction, recurrence_rrule, next_due_date)
         VALUES ($1, $2, NULL, $3, 'Payday', 1000.00, 'inflow', 'FREQ=WEEKLY;INTERVAL=2', $4::date)`,
        [paydayScheduleId, tenantId, accountId, options.paydayDue],
      );
    }
  });
  return { tenantId, accountId, rentId, spendingId, paydayScheduleId, rentScheduleId };
}

async function cleanup(tenantId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM allocations WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM transactions WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM scheduled_schedules WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM cycle_sweeps WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`UPDATE envelopes SET sweep_envelope_id = NULL WHERE tenant_id = $1`, [
    tenantId,
  ]);
  await pool.query(`DELETE FROM envelopes WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM accounts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
}

async function bypass<T>(fn: (query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, string>[] }>) => Promise<T>): Promise<T> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    return fn((sql, params) => client.query(sql, params));
  });
}

async function envelopeBalance(envelopeId: string): Promise<number> {
  const rows = await bypass((q) =>
    q(`SELECT current_balance::text AS v FROM envelopes WHERE id = $1`, [envelopeId]),
  );
  return toCents(rows.rows[0].v);
}

async function nextDue(scheduleId: string): Promise<string> {
  const rows = await bypass((q) =>
    q(`SELECT next_due_date::text AS v FROM scheduled_schedules WHERE id = $1`, [scheduleId]),
  );
  return rows.rows[0].v;
}

describe("Phase 8 ledger, continuity, and observability", () => {
  afterAll(async () => {
    for (const id of createdTenants) await cleanup(id);
    await getPool().end();
  });

  it(
    "a Saturday payday is treated as Friday for the next-inflow date and N_p",
    async () => {
      // 2026-11-14 is a Saturday. On Tuesday 11-10 the payday lands Friday 11-13: three days.
      const t = await createTenant({ paydayDue: "2026-11-14", rentDue: "2026-12-20" });
      const summary = await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        return runEvaluationPipeline(client, {
          tenantId: t.tenantId,
          userId: USER_ID,
          trigger: "sync",
          asOfDate: "2026-11-10",
        });
      });
      expect(summary.nP).toBe(3);
      const snap = await bypass((q) =>
        q(`SELECT next_payday::text AS v FROM allowance_snapshots WHERE tenant_id = $1`, [
          t.tenantId,
        ]),
      );
      expect(snap.rows[0].v).toBe("2026-11-13");
    },
    60_000,
  );

  it(
    "records a payday through the service, settles once, advances the named schedule, and replays safely",
    async () => {
      const t = await createTenant({ paydayDue: "2026-11-10", rentDue: "2026-11-20" });
      const key = `payday-${randomUUID()}`;
      const first = await transactionService.recordInflow({
        tenantId: t.tenantId,
        userId: USER_ID,
        role: "owner",
        amountCents: 100_000,
        idempotencyKey: key,
        scheduleId: t.paydayScheduleId ?? undefined,
        asOfDate: "2026-11-10",
      });

      // Every cent assigned; the bank moved; payday advanced a fortnight.
      const allocated = await bypass((q) =>
        q(`SELECT COALESCE(SUM(amount), 0)::text AS v FROM allocations WHERE transaction_id = $1`, [
          first.id,
        ]),
      );
      expect(toCents(allocated.rows[0].v)).toBe(100_000);
      const bank = await bypass((q) =>
        q(`SELECT current_balance::text AS v FROM accounts WHERE id = $1`, [t.accountId]),
      );
      expect(toCents(bank.rows[0].v)).toBe(200_000);
      expect(await nextDue(t.paydayScheduleId ?? "")).toBe("2026-11-24");

      // The run is finished with the observability fields filled in.
      const run = await bypass((q) =>
        q(
          `SELECT status, reason_code, cash_cents::text, triggered_by_user_id::text
           FROM pipeline_runs WHERE tenant_id = $1 AND transaction_id = $2`,
          [t.tenantId, first.id],
        ),
      );
      expect(run.rows).toHaveLength(1);
      expect(run.rows[0]).toMatchObject({
        status: "ok",
        reason_code: "ok",
        cash_cents: "200000",
        triggered_by_user_id: USER_ID,
      });
      // The settle step reports how many transactions settled, not cents.
      const settle = await bypass((q) =>
        q(
          `SELECT s.payload->>'settledCount' AS v
           FROM pipeline_steps s JOIN pipeline_runs r ON r.id = s.run_id
           WHERE r.tenant_id = $1 AND s.step = 'settle' AND r.transaction_id = $2`,
          [t.tenantId, first.id],
        ),
      );
      expect(settle.rows[0].v).toBe("1");

      // Same key, same amount: the original id, nothing booked twice, no orphan run.
      const replay = await transactionService.recordInflow({
        tenantId: t.tenantId,
        userId: USER_ID,
        role: "owner",
        amountCents: 100_000,
        idempotencyKey: key,
        scheduleId: t.paydayScheduleId ?? undefined,
        asOfDate: "2026-11-10",
      });
      expect(replay.id).toBe(first.id);
      const counts = await bypass((q) =>
        q(
          `SELECT (SELECT COUNT(*) FROM transactions WHERE tenant_id = $1)::text AS txns,
                  (SELECT COUNT(*) FROM pipeline_runs WHERE tenant_id = $1)::text AS runs`,
          [t.tenantId],
        ),
      );
      expect(counts.rows[0]).toMatchObject({ txns: "1", runs: "1" });
      expect(await nextDue(t.paydayScheduleId ?? "")).toBe("2026-11-24");

      // Same key, other amount: refused, not silently reused.
      await expect(
        transactionService.recordInflow({
          tenantId: t.tenantId,
          userId: USER_ID,
          role: "owner",
          amountCents: 100_001,
          idempotencyKey: key,
          asOfDate: "2026-11-10",
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    },
    90_000,
  );

  it(
    "records a bill payment against the schedule's envelope and advances that schedule",
    async () => {
      const t = await createTenant({
        paydayDue: "2026-11-24",
        rentDue: "2026-11-20",
        rentBalance: "500.00",
      });
      await transactionService.recordOutflow({
        tenantId: t.tenantId,
        userId: USER_ID,
        role: "admin",
        amountCents: 50_000,
        idempotencyKey: `rent-${randomUUID()}`,
        scheduleId: t.rentScheduleId,
        asOfDate: "2026-11-10",
      });
      expect(await envelopeBalance(t.rentId)).toBe(0);
      expect(await nextDue(t.rentScheduleId)).toBe("2026-12-20");

      // A bill that costs more than its envelope: the rest reduces Spending (D12).
      await transactionService.recordOutflow({
        tenantId: t.tenantId,
        userId: USER_ID,
        role: "owner",
        amountCents: 2_000,
        idempotencyKey: `rent-extra-${randomUUID()}`,
        envelopeId: t.rentId,
        asOfDate: "2026-11-10",
      });
      expect(await envelopeBalance(t.rentId)).toBe(0);
      expect(await envelopeBalance(t.spendingId)).toBe(10_000 - 2_000);
    },
    90_000,
  );

  it(
    "limits inflow and outflow to owner and admin, and rejects an outflow with no envelope",
    async () => {
      const t = await createTenant({ paydayDue: "2026-11-24", rentDue: "2026-11-20" });
      for (const role of ["member", "advisor", "read_only"] as const) {
        await expect(
          transactionService.recordInflow({
            tenantId: t.tenantId,
            userId: USER_ID,
            role,
            amountCents: 100,
            idempotencyKey: `x-${randomUUID()}`,
          }),
        ).rejects.toThrow("Forbidden");
      }
      await expect(
        transactionService.recordOutflow({
          tenantId: t.tenantId,
          userId: USER_ID,
          role: "owner",
          amountCents: 100,
          idempotencyKey: `x-${randomUUID()}`,
          asOfDate: "2026-11-10",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      // A rejected request leaves no run behind.
      const runs = await bypass((q) =>
        q(`SELECT COUNT(*)::text AS v FROM pipeline_runs WHERE tenant_id = $1`, [t.tenantId]),
      );
      expect(runs.rows[0].v).toBe("0");
    },
    60_000,
  );

  it(
    "serializes concurrent purchases per tenant and collapses a duplicate key to one transaction",
    async () => {
      const t = await createTenant({
        paydayDue: "2026-11-24",
        rentDue: "2026-12-20",
        spendingBalance: "300.00",
      });
      const common = {
        tenantId: t.tenantId,
        userId: USER_ID,
        role: "owner" as const,
        asOfDate: "2026-11-10",
      };
      const sharedKey = `dup-${randomUUID()}`;
      const results = await Promise.all([
        transactionService.createPurchase({ ...common, amountCents: 1_000, idempotencyKey: "a-" + sharedKey }),
        transactionService.createPurchase({ ...common, amountCents: 2_000, idempotencyKey: "b-" + sharedKey }),
        transactionService.createPurchase({ ...common, amountCents: 500, idempotencyKey: sharedKey }),
        transactionService.createPurchase({ ...common, amountCents: 500, idempotencyKey: sharedKey }),
      ]);
      expect(results[2].id).toBe(results[3].id);
      expect(await envelopeBalance(t.spendingId)).toBe(30_000 - 1_000 - 2_000 - 500);

      const counts = await bypass((q) =>
        q(
          `SELECT (SELECT COUNT(*) FROM transactions WHERE tenant_id = $1)::text AS txns,
                  (SELECT COUNT(*) FROM pipeline_runs WHERE tenant_id = $1 AND status = 'running')::text AS running`,
          [t.tenantId],
        ),
      );
      // Three distinct purchases. No run is left half-open by the duplicate.
      expect(counts.rows[0]).toMatchObject({ txns: "3", running: "0" });

      await expect(
        transactionService.createPurchase({ ...common, amountCents: 999, idempotencyKey: sharedKey }),
      ).rejects.toBeInstanceOf(ConflictError);
    },
    120_000,
  );

  it(
    "publishes a zero hero and a no_future_inflow reason when no payday is scheduled",
    async () => {
      const t = await createTenant({ paydayDue: null, rentDue: "2026-12-20" });
      // Yesterday's hero is still on the snapshot.
      await bypass((q) =>
        q(
          `INSERT INTO allowance_snapshots (tenant_id, as_of_date, s_daily, s_today, n_p, o_unfunded)
           VALUES ($1, '2026-11-09', 55.00, 55.00, 4, 0)`,
          [t.tenantId],
        ),
      );
      const summary = await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        return runEvaluationPipeline(client, {
          tenantId: t.tenantId,
          userId: USER_ID,
          trigger: "sync",
          asOfDate: "2026-11-10",
        });
      });
      expect(summary.nP).toBeNull();
      expect(summary.reasonCode).toBe("no_future_inflow");
      const snap = await bypass((q) =>
        q(
          `SELECT s_daily::text, s_today::text, n_p::text, as_of_date::text
           FROM allowance_snapshots WHERE tenant_id = $1`,
          [t.tenantId],
        ),
      );
      expect(snap.rows[0]).toMatchObject({
        s_daily: "0.00",
        s_today: "0.00",
        n_p: null,
        as_of_date: "2026-11-10",
      });
      const run = await bypass((q) =>
        q(`SELECT reason_code FROM pipeline_runs WHERE id = $1`, [summary.runId]),
      );
      expect(run.rows[0].reason_code).toBe("no_future_inflow");
    },
    60_000,
  );

  it(
    "keeps the prior cycle's burn for future days while payday is unsettled",
    async () => {
      const t = await createTenant({
        paydayDue: "2026-11-10",
        rentDue: "2026-12-20",
        spendingBalance: "500.00",
      });
      await bypass((q) =>
        q(
          `INSERT INTO pipeline_runs (tenant_id, trigger, as_of_date, status, s_daily)
           VALUES ($1, 'midnight', '2026-11-09', 'ok', 10.00)`,
          [t.tenantId],
        ),
      );
      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        await runEvaluationPipeline(client, {
          tenantId: t.tenantId,
          userId: USER_ID,
          trigger: "sync",
          asOfDate: "2026-11-10",
        });
      });
      // N_p = 1 would put the whole $500 pool on tomorrow. The prior $10 pace holds instead.
      const day1 = await bypass((q) =>
        q(
          `SELECT assumed_burn::text AS v FROM forecast_days
           WHERE tenant_id = $1 AND day_offset = 1`,
          [t.tenantId],
        ),
      );
      expect(day1.rows[0].v).toBe("10.00");
    },
    60_000,
  );

  it(
    "leaves a run `running` when work dies before settle, then the abandoned sweep closes it",
    async () => {
      const t = await createTenant({ paydayDue: "2026-11-24", rentDue: "2026-12-20" });

      // A crash: the run opened on its own connection, the money transaction never got going.
      const ctx = await beginPipelineRun({
        tenantId: t.tenantId,
        trigger: "sync",
        asOfDate: "2026-11-10",
        triggeredByUserId: USER_ID,
      });
      const open = await bypass((q) =>
        q(`SELECT status, triggered_by_user_id::text FROM pipeline_runs WHERE id = $1`, [ctx.runId]),
      );
      expect(open.rows[0]).toMatchObject({ status: "running", triggered_by_user_id: USER_ID });

      await bypass((q) =>
        q(`UPDATE pipeline_runs SET started_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, [
          ctx.runId,
        ]),
      );
      const closed = await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        return closeAbandonedPipelineRuns(client, 60);
      });
      expect(closed).toBeGreaterThanOrEqual(1);
      const after = await bypass((q) =>
        q(`SELECT status, error_code, reason_code FROM pipeline_runs WHERE id = $1`, [ctx.runId]),
      );
      expect(after.rows[0]).toMatchObject({
        status: "error",
        error_code: "abandoned",
        reason_code: "abandoned",
      });
    },
    60_000,
  );

  it(
    "records an error run when work throws after the run opened but before settle, and drops it for a rejected request",
    async () => {
      const t = await createTenant({ paydayDue: "2026-11-24", rentDue: "2026-12-20" });
      let thrownRunId = "";
      await expect(
        withPipelineRun(
          { tenantId: t.tenantId, trigger: "sync", asOfDate: "2026-11-10" },
          async (run) => {
            thrownRunId = run.runId;
            throw new Error("boom before settle");
          },
        ),
      ).rejects.toThrow("boom before settle");
      const failed = await bypass((q) =>
        q(`SELECT status, error_code FROM pipeline_runs WHERE id = $1`, [thrownRunId]),
      );
      expect(failed.rows[0]).toMatchObject({ status: "error", error_code: "pipeline_exception" });

      let rejectedRunId = "";
      await expect(
        withPipelineRun(
          { tenantId: t.tenantId, trigger: "sync", asOfDate: "2026-11-10" },
          async (run) => {
            rejectedRunId = run.runId;
            throw new ValidationError("nope");
          },
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      const gone = await bypass((q) =>
        q(`SELECT 1 FROM pipeline_runs WHERE id = $1`, [rejectedRunId]),
      );
      expect(gone.rows).toHaveLength(0);
    },
    60_000,
  );

  it(
    "tracks a midnight batch's counters",
    async () => {
      const id = await startCronBatch({ dueCount: 3, meta: { forceAll: false } });
      await finishCronBatch(
        id,
        { dueCount: 3, okCount: 2, errorCount: 1, skippedCount: 4 },
        { pruned: 0 },
      );
      const batch = await bypass((q) =>
        q(
          `SELECT due_count::text, ok_count::text, error_count::text, skipped_count::text,
                  (finished_at IS NOT NULL)::text AS finished, meta::text
           FROM cron_batches WHERE id = $1`,
          [id],
        ),
      );
      expect(batch.rows[0]).toMatchObject({
        due_count: "3",
        ok_count: "2",
        error_count: "1",
        skipped_count: "4",
        finished: "true",
      });
      expect(JSON.parse(batch.rows[0].meta)).toEqual({ forceAll: false, pruned: 0 });
      await getPool().query(`DELETE FROM cron_batches WHERE id = $1`, [id]);
    },
    60_000,
  );
});
