import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { getPool, withTransaction } from "@/lib/db/connection";
import { ConflictError, ValidationError } from "@/lib/errors/service-errors";
import { finishStaleCronBatches } from "@/lib/pipeline/cron-batch";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { loadTenantSnapshotRows, selectStaleTenantIds } from "@/lib/pipeline/stale-tenants";
import { closeAbandonedPipelineRuns, beginPipelineRun } from "@/lib/pipeline/telemetry";
import { withPipelineRun } from "@/lib/pipeline/with-run";
import { pipelineService } from "@/lib/services/pipeline/PipelineService";
import { planService } from "@/lib/services/plan/PlanService";
import { transactionService } from "@/lib/services/transactions/TransactionService";

config({ path: ".env" });

const USER_ID = randomUUID();
const createdTenants: string[] = [];
const createdBatches: string[] = [];
const createdRateKeys: string[] = [];

interface TestTenant {
  tenantId: string;
  accountId: string;
  rentId: string;
  rentScheduleId: string;
  paydayScheduleId: string;
}

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, string>[] }>;

async function bypass<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    return fn((sql, params) => client.query(sql, params));
  });
}

/** An isolated household, so these tests never touch Harbor. */
async function createTenant(options?: {
  rentBalance?: string;
  snapshotDate?: string | null;
}): Promise<TestTenant> {
  const tenantId = randomUUID();
  const accountId = randomUUID();
  const rentId = randomUUID();
  const rentScheduleId = randomUUID();
  const paydayScheduleId = randomUUID();
  createdTenants.push(tenantId);
  await bypass(async (q) => {
    await q(
      `INSERT INTO tenants (id, name, tenant_type, timezone, holiday_region)
       VALUES ($1, 'P9 test', 'household', 'UTC', 'US')`,
      [tenantId],
    );
    await q(
      `INSERT INTO accounts (id, tenant_id, name, current_balance, is_everyday)
       VALUES ($1, $2, 'Checking', 1000.00, TRUE)`,
      [accountId, tenantId],
    );
    await q(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, target_cap, rollover_policy)
       VALUES ($1, $2, 'Rent', 'fixed', 1, $3, 500.00, 'top_up')`,
      [rentId, tenantId, options?.rentBalance ?? "0.00"],
    );
    await q(
      `INSERT INTO envelopes
         (tenant_id, name, tier_category, priority_order, current_balance, rollover_policy)
       VALUES ($1, 'Spending', 'discretionary', 1, 100.00, 'reset_sweep')`,
      [tenantId],
    );
    await q(
      `INSERT INTO scheduled_schedules
         (id, tenant_id, envelope_id, account_id, title, amount, direction, recurrence_rrule, next_due_date)
       VALUES ($1, $2, $3, $4, 'Rent', 500.00, 'outflow', 'FREQ=MONTHLY', '2099-12-20')`,
      [rentScheduleId, tenantId, rentId, accountId],
    );
    await q(
      `INSERT INTO scheduled_schedules
         (id, tenant_id, envelope_id, account_id, title, amount, direction, recurrence_rrule, next_due_date)
       VALUES ($1, $2, NULL, $3, 'Payday', 1000.00, 'inflow', 'FREQ=WEEKLY;INTERVAL=2', '2099-11-24')`,
      [paydayScheduleId, tenantId, accountId],
    );
    if (options?.snapshotDate) {
      await q(
        `INSERT INTO allowance_snapshots
           (tenant_id, as_of_date, s_daily, s_today, n_p, o_unfunded, mitigated, next_payday)
         VALUES ($1, $2::date, 10.00, 10.00, 5, 0.00, FALSE, '2099-11-24')`,
        [tenantId, options.snapshotDate],
      );
    }
  });
  return { tenantId, accountId, rentId, rentScheduleId, paydayScheduleId };
}

async function cleanup(tenantId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM allocations WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM transactions WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM scheduled_schedules WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM cycle_sweeps WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM allowance_snapshots WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM forecast_days WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`UPDATE envelopes SET sweep_envelope_id = NULL WHERE tenant_id = $1`, [
    tenantId,
  ]);
  await pool.query(`DELETE FROM envelopes WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM accounts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
}

describe("Phase 9 midnight catch-up, observability, abuse guards, and plan continuity", () => {
  afterAll(async () => {
    for (const id of createdTenants) await cleanup(id);
    if (createdBatches.length > 0) {
      await getPool().query(`DELETE FROM cron_batches WHERE id = ANY($1::uuid[])`, [
        createdBatches,
      ]);
    }
    if (createdRateKeys.length > 0) {
      await getPool().query(`DELETE FROM auth_rate_limits WHERE key = ANY($1::text[])`, [
        createdRateKeys,
      ]);
    }
    await getPool().end();
    // Many throwaway tenants, one round trip per delete: allow the cleanup time.
  }, 180_000);

  it(
    "catch-up selection finds tenants with no snapshot or an earlier one, and skips current ones",
    async () => {
      const now = new Date("2026-11-10T14:00:00Z");
      const never = await createTenant({ snapshotDate: null });
      const behind = await createTenant({ snapshotDate: "2026-11-08" });
      const current = await createTenant({ snapshotDate: "2026-11-10" });

      const rows = await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        return loadTenantSnapshotRows(client);
      });
      const mine = new Set([never.tenantId, behind.tenantId, current.tenantId]);
      const picked = selectStaleTenantIds(
        rows.filter((r) => mine.has(r.id)),
        now,
        { limit: 50 },
      );
      expect(picked).toEqual([never.tenantId, behind.tenantId]);

      // A tenant already due this tick is not picked twice.
      expect(
        selectStaleTenantIds(
          rows.filter((r) => mine.has(r.id)),
          now,
          { alreadyDue: new Set([never.tenantId]) },
        ),
      ).toEqual([behind.tenantId]);
    },
    60_000,
  );

  it(
    "closes cron batches left unfinished for more than the cutoff, and spares the current one",
    async () => {
      const stale = randomUUID();
      const fresh = randomUUID();
      const current = randomUUID();
      createdBatches.push(stale, fresh, current);
      await bypass((q) =>
        q(
          `INSERT INTO cron_batches (id, started_at, due_count) VALUES
             ($1, NOW() - INTERVAL '3 hours', 1),
             ($2, NOW() - INTERVAL '10 minutes', 1),
             ($3, NOW() - INTERVAL '5 hours', 1)`,
          [stale, fresh, current],
        ),
      );
      const closed = await finishStaleCronBatches({ minutes: 120, excludeId: current });
      expect(closed).toBeGreaterThanOrEqual(1);
      const rows = await bypass((q) =>
        q(
          `SELECT id::text, (finished_at IS NOT NULL)::text AS finished, meta::text
           FROM cron_batches WHERE id = ANY($1::uuid[])`,
          [[stale, fresh, current]],
        ),
      );
      const byId = new Map(rows.rows.map((r) => [r.id, r]));
      expect(byId.get(stale)?.finished).toBe("true");
      expect(JSON.parse(byId.get(stale)?.meta ?? "{}")).toMatchObject({ abandoned: true });
      expect(byId.get(fresh)?.finished).toBe("false");
      expect(byId.get(current)?.finished).toBe("false");
    },
    60_000,
  );

  it(
    "stamps finished_at after the money callback returns, not at the transaction start",
    async () => {
      const t = await createTenant();
      let runId = "";
      await withPipelineRun(
        { tenantId: t.tenantId, trigger: "midnight", asOfDate: "2099-11-10" },
        async (run) => {
          runId = run.runId;
          await withTransaction({ tenantId: t.tenantId, userId: USER_ID }, async (client) => {
            await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
            await runEvaluationPipeline(client, {
              tenantId: t.tenantId,
              userId: USER_ID,
              trigger: "midnight",
              asOfDate: "2099-11-10",
              runId: run.runId,
              runPreStarted: true,
            });
          });
          await new Promise((resolve) => setTimeout(resolve, 250));
        },
      );
      const row = await bypass((q) =>
        q(
          `SELECT status,
                  (EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::int AS ms
           FROM pipeline_runs WHERE id = $1`,
          [runId],
        ),
      );
      expect(row.rows[0].status).toBe("ok");
      // The 250 ms after the money transaction is part of the run.
      expect(Number(row.rows[0].ms)).toBeGreaterThanOrEqual(250);
    },
    60_000,
  );

  it(
    "persists a truncated error_message on a failed run and on an abandoned one",
    async () => {
      const t = await createTenant();
      let failedId = "";
      await expect(
        withPipelineRun(
          { tenantId: t.tenantId, trigger: "sync", asOfDate: "2099-11-10" },
          async (run) => {
            failedId = run.runId;
            throw new Error(`boom ${"x".repeat(600)}`);
          },
        ),
      ).rejects.toThrow("boom");
      const failed = await bypass((q) =>
        q(`SELECT status, error_message FROM pipeline_runs WHERE id = $1`, [failedId]),
      );
      expect(failed.rows[0].status).toBe("error");
      expect(failed.rows[0].error_message.startsWith("boom")).toBe(true);
      expect(failed.rows[0].error_message.length).toBeLessThanOrEqual(256);

      const ctx = await beginPipelineRun({
        tenantId: t.tenantId,
        trigger: "sync",
        asOfDate: "2099-11-10",
      });
      await bypass((q) =>
        q(`UPDATE pipeline_runs SET started_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, [
          ctx.runId,
        ]),
      );
      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        await closeAbandonedPipelineRuns(client, 60);
      });
      const abandoned = await bypass((q) =>
        q(`SELECT error_code, error_message FROM pipeline_runs WHERE id = $1`, [ctx.runId]),
      );
      expect(abandoned.rows[0].error_code).toBe("abandoned");
      expect(abandoned.rows[0].error_message).toMatch(/did not finish/i);
    },
    60_000,
  );

  it(
    "Activity's latest batch is the newest one that ran a midnight pass for this tenant",
    async () => {
      const mine = await createTenant();
      const other = await createTenant();
      const olderBatch = randomUUID();
      const newerBatch = randomUUID();
      createdBatches.push(olderBatch, newerBatch);
      await bypass(async (q) => {
        await q(
          `INSERT INTO cron_batches (id, started_at, finished_at, due_count, ok_count)
           VALUES ($1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', 1, 1),
                  ($2, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 1, 1)`,
          [olderBatch, newerBatch],
        );
        await q(
          `INSERT INTO pipeline_runs (tenant_id, trigger, as_of_date, status, cron_batch_id)
           VALUES ($1, 'midnight', '2099-11-08', 'ok', $3),
                  ($2, 'midnight', '2099-11-09', 'ok', $4)`,
          [mine.tenantId, other.tenantId, olderBatch, newerBatch],
        );
      });
      const result = await pipelineService.listRuns({
        tenantId: mine.tenantId,
        userId: USER_ID,
        role: "owner",
      });
      expect(result.latestBatch?.id).toBe(olderBatch);
    },
    60_000,
  );

  it(
    "accepts an offline purchase's booked date up to tomorrow and rejects anything later",
    async () => {
      const t = await createTenant();
      const base = {
        tenantId: t.tenantId,
        userId: USER_ID,
        role: "owner" as const,
        amountCents: 500,
        asOfDate: "2099-11-10",
      };
      await transactionService.createPurchase({
        ...base,
        idempotencyKey: `p9-past-${randomUUID()}`,
        bookedDate: "2099-11-08",
      });
      await transactionService.createPurchase({
        ...base,
        idempotencyKey: `p9-tomorrow-${randomUUID()}`,
        bookedDate: "2099-11-11",
      });
      await expect(
        transactionService.createPurchase({
          ...base,
          idempotencyKey: `p9-future-${randomUUID()}`,
          bookedDate: "2099-11-12",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      const dates = await bypass((q) =>
        q(
          `SELECT booked_date::text AS d FROM transactions
           WHERE tenant_id = $1 AND amount < 0 ORDER BY booked_date`,
          [t.tenantId],
        ),
      );
      expect(dates.rows.map((r) => r.d)).toEqual(["2099-11-08", "2099-11-11"]);
    },
    60_000,
  );

  it(
    "rate-limits a key inside its window and resets after the window",
    async () => {
      const key = `test:${randomUUID()}`;
      createdRateKeys.push(key);
      const hit = () => consumeRateLimit({ key, limit: 2, windowSeconds: 900 });
      expect((await hit()).allowed).toBe(true);
      expect((await hit()).allowed).toBe(true);
      const blocked = await hit();
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

      await getPool().query(
        `UPDATE auth_rate_limits SET window_started = NOW() - INTERVAL '16 minutes' WHERE key = $1`,
        [key],
      );
      const reset = await hit();
      expect(reset.allowed).toBe(true);
      expect(reset.hits).toBe(1);
    },
    60_000,
  );

  it(
    "removes a bill with nothing set aside by archiving it, and keeps a funded bill's money",
    async () => {
      const t = await createTenant();
      const ids = { tenantId: t.tenantId, userId: USER_ID, role: "owner" as const };

      const removed = await planService.removeEnvelope({ ...ids, envelopeId: t.rentId });
      expect(removed).toEqual({ id: t.rentId, archived: true });
      const plan = await planService.getPlan(t.tenantId, USER_ID);
      expect(plan.bills).toHaveLength(0);
      const schedule = await bypass((q) =>
        q(`SELECT is_active::text AS v FROM scheduled_schedules WHERE id = $1`, [t.rentScheduleId]),
      );
      expect(schedule.rows[0].v).toBe("false");

      const funded = await createTenant({ rentBalance: "120.00" });
      const kept = await planService.removeEnvelope({
        tenantId: funded.tenantId,
        userId: USER_ID,
        role: "owner",
        envelopeId: funded.rentId,
      });
      expect(kept.archived).toBe(false);
      const row = await bypass((q) =>
        q(`SELECT current_balance::text AS bal, target_cap, archived_at FROM envelopes WHERE id = $1`, [
          funded.rentId,
        ]),
      );
      expect(row.rows[0].bal).toBe("120.00");
      expect(row.rows[0].archived_at).toBeNull();
      // No cap, so the waterfall no longer tops it up.
      expect(row.rows[0].target_cap).toBeNull();

      await expect(
        planService.removeEnvelope({
          tenantId: funded.tenantId,
          userId: USER_ID,
          role: "member",
          envelopeId: funded.rentId,
        }),
      ).rejects.toThrow("Forbidden");
    },
    60_000,
  );

  it(
    "refuses to remove a goal that still holds money",
    async () => {
      const t = await createTenant();
      const goalId = randomUUID();
      await bypass((q) =>
        q(
          `INSERT INTO envelopes
             (id, tenant_id, name, tier_category, priority_order, current_balance, monthly_installment, rollover_policy)
           VALUES ($1, $2, 'Trip', 'sinking', 1, 40.00, 20.00, 'accumulate')`,
          [goalId, t.tenantId],
        ),
      );
      await expect(
        planService.removeEnvelope({
          tenantId: t.tenantId,
          userId: USER_ID,
          role: "admin",
          envelopeId: goalId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    },
    60_000,
  );

  it(
    "updates a schedule's amount, next date, and rule for owners and admins only",
    async () => {
      const t = await createTenant();
      await planService.updateSchedule({
        tenantId: t.tenantId,
        userId: USER_ID,
        role: "admin",
        scheduleId: t.paydayScheduleId,
        changes: {
          amountCents: 123_456,
          nextDueDate: "2099-12-01",
          recurrenceRrule: "FREQ=MONTHLY;BYMONTHDAY=1",
        },
      });
      const row = await bypass((q) =>
        q(
          `SELECT amount::text AS amount, next_due_date::text AS due, recurrence_rrule AS rule
           FROM scheduled_schedules WHERE id = $1`,
          [t.paydayScheduleId],
        ),
      );
      expect(row.rows[0]).toEqual({
        amount: "1234.56",
        due: "2099-12-01",
        rule: "FREQ=MONTHLY;BYMONTHDAY=1",
      });
      await expect(
        planService.updateSchedule({
          tenantId: t.tenantId,
          userId: USER_ID,
          role: "member",
          scheduleId: t.paydayScheduleId,
          changes: { amountCents: 100 },
        }),
      ).rejects.toThrow("Forbidden");
    },
    60_000,
  );
});
