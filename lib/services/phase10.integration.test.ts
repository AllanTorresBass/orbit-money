import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { loadHealth } from "@/lib/db/health";
import { ConflictError, ValidationError } from "@/lib/errors/service-errors";
import { recordMidnightOutcome } from "@/lib/pipeline/midnight-failures";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { loadTenantSnapshotRows, selectCatchUpTenants } from "@/lib/pipeline/stale-tenants";
import { planService } from "@/lib/services/plan/PlanService";
import { transactionService } from "@/lib/services/transactions/TransactionService";

config({ path: ".env" });

const OWNER_ID = randomUUID();
const MEMBER_ID = randomUUID();
const createdTenants: string[] = [];

type Row = Record<string, string>;
type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

async function bypass<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    return fn((sql, params) => client.query(sql, params));
  });
}

interface TestTenant {
  tenantId: string;
  accountId: string;
  rentId: string;
  rentScheduleId: string;
  spendingId: string;
  emergencyId: string;
  vacationId: string;
  tripId: string;
}

/** An isolated household: Rent (scheduled), Spending, Emergency (the sweep sink), two goals. */
async function createTenant(options?: { rentBalance?: string; vacationBalance?: string }): Promise<TestTenant> {
  const t: TestTenant = {
    tenantId: randomUUID(),
    accountId: randomUUID(),
    rentId: randomUUID(),
    rentScheduleId: randomUUID(),
    spendingId: randomUUID(),
    emergencyId: randomUUID(),
    vacationId: randomUUID(),
    tripId: randomUUID(),
  };
  createdTenants.push(t.tenantId);
  await bypass(async (q) => {
    await q(
      `INSERT INTO tenants (id, name, tenant_type, timezone, holiday_region)
       VALUES ($1, 'P10 test', 'household', 'UTC', 'US')`,
      [t.tenantId],
    );
    await q(
      `INSERT INTO accounts (id, tenant_id, name, current_balance, is_everyday)
       VALUES ($1, $2, 'Checking', 1000.00, TRUE)`,
      [t.accountId, t.tenantId],
    );
    await q(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, target_cap, rollover_policy)
       VALUES ($1, $2, 'Rent', 'fixed', 1, $3, 500.00, 'top_up')`,
      [t.rentId, t.tenantId, options?.rentBalance ?? "0.00"],
    );
    await q(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, rollover_policy)
       VALUES ($1, $2, 'Spending', 'discretionary', 1, 100.00, 'reset_sweep')`,
      [t.spendingId, t.tenantId],
    );
    // Renamed on purpose: the sink is hidden by id, never by the name "Emergency".
    await q(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, rollover_policy)
       VALUES ($1, $2, 'Rainy day', 'sinking', 1, 0.00, 'accumulate')`,
      [t.emergencyId, t.tenantId],
    );
    await q(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, rollover_policy)
       VALUES ($1, $2, 'Vacation', 'sinking', 2, $3, 'accumulate')`,
      [t.vacationId, t.tenantId, options?.vacationBalance ?? "0.00"],
    );
    await q(
      `INSERT INTO envelopes
         (id, tenant_id, name, tier_category, priority_order, current_balance, rollover_policy)
       VALUES ($1, $2, 'Trip', 'sinking', 3, 0.00, 'accumulate')`,
      [t.tripId, t.tenantId],
    );
    await q(`UPDATE envelopes SET sweep_envelope_id = $1 WHERE id = $2`, [
      t.emergencyId,
      t.spendingId,
    ]);
    await q(
      `INSERT INTO scheduled_schedules
         (id, tenant_id, envelope_id, account_id, title, amount, direction, recurrence_rrule, next_due_date)
       VALUES ($1, $2, $3, $4, 'Rent', 500.00, 'outflow', 'FREQ=MONTHLY', '2099-12-20')`,
      [t.rentScheduleId, t.tenantId, t.rentId, t.accountId],
    );
    await q(
      `INSERT INTO scheduled_schedules
         (tenant_id, envelope_id, account_id, title, amount, direction, recurrence_rrule, next_due_date)
       VALUES ($1, NULL, $2, 'Payday', 1000.00, 'inflow', 'FREQ=WEEKLY;INTERVAL=2', '2099-11-24')`,
      [t.tenantId, t.accountId],
    );
  });
  return t;
}

async function cleanup(tenantId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM allocations WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM transactions WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM envelope_proposals WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM scheduled_schedules WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM cycle_sweeps WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM allowance_snapshots WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM forecast_days WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`UPDATE envelopes SET sweep_envelope_id = NULL WHERE tenant_id = $1`, [
    tenantId,
  ]);
  await pool.query(`DELETE FROM envelopes WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM accounts WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM pipeline_runs WHERE tenant_id = $1`, [tenantId]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
}

async function balances(t: TestTenant): Promise<{ spending: number; rent: number; bank: number }> {
  const rows = await bypass(async (q) => {
    const env = await q(
      `SELECT id::text, (current_balance * 100)::bigint::text AS cents FROM envelopes WHERE tenant_id = $1`,
      [t.tenantId],
    );
    const bank = await q(
      `SELECT (SUM(current_balance) * 100)::bigint::text AS cents FROM accounts WHERE tenant_id = $1`,
      [t.tenantId],
    );
    return { env: env.rows, bank: bank.rows[0] };
  });
  const byId = new Map(rows.env.map((r) => [r.id, Number(r.cents)]));
  return {
    spending: byId.get(t.spendingId) ?? NaN,
    rent: byId.get(t.rentId) ?? NaN,
    bank: Number(rows.bank.cents),
  };
}

describe("Phase 10 reorder, undo, continuity, poison skip, and health", () => {
  afterAll(async () => {
    for (const id of createdTenants) await cleanup(id);
    await getPool().query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      [OWNER_ID, MEMBER_ID],
    ]);
    await getPool().end();
  }, 180_000);

  it(
    "reorder tolerates the hidden sweep sink and keeps its slot; Plan hides it by id",
    async () => {
      const t = await createTenant();
      const plan = await planService.getPlan(t.tenantId, OWNER_ID);
      expect(plan.goals.map((g) => g.name)).toEqual(["Vacation", "Trip"]);

      // The screen sends only the goals it shows.
      await planService.reorderEnvelopes({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        tierCategory: "sinking",
        orderedIds: [t.tripId, t.vacationId],
      });
      const rows = await bypass((q) =>
        q(
          `SELECT name, priority_order::text AS p FROM envelopes
           WHERE tenant_id = $1 AND tier_category = 'sinking' ORDER BY priority_order`,
          [t.tenantId],
        ),
      );
      expect(rows.rows.map((r) => r.name)).toEqual(["Rainy day", "Trip", "Vacation"]);

      // Sending the sink itself, or too few ids, is still rejected.
      await expect(
        planService.reorderEnvelopes({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          tierCategory: "sinking",
          orderedIds: [t.emergencyId, t.tripId, t.vacationId],
        }),
      ).rejects.toThrow("Validation failed");
      await expect(
        planService.reorderEnvelopes({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          tierCategory: "sinking",
          orderedIds: [t.tripId],
        }),
      ).rejects.toThrow("Validation failed");
    },
    60_000,
  );

  it(
    "undoes a purchase once: balances and S_today come back, a second undo is refused",
    async () => {
      const t = await createTenant();
      const baseline = await withTransaction(
        { tenantId: t.tenantId, userId: OWNER_ID },
        (client) =>
          runEvaluationPipeline(client, {
            tenantId: t.tenantId,
            userId: OWNER_ID,
            trigger: "sync",
          }),
      );

      const purchase = await transactionService.createPurchase({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        amountCents: 3_000,
        idempotencyKey: randomUUID(),
        memo: "Coffee beans",
      });
      expect(await balances(t)).toMatchObject({ spending: 7_000, bank: 97_000 });
      expect(purchase.sTodayCents).toBe((baseline.sTodayCents ?? 0) - 3_000);

      const undone = await transactionService.voidTransaction({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        transactionId: purchase.id,
      });
      expect(await balances(t)).toMatchObject({ spending: 10_000, bank: 100_000 });
      expect(undone.sTodayCents).toBe(baseline.sTodayCents);

      const link = await bypass((q) =>
        q(
          `SELECT reverses_transaction_id::text AS r, (amount * 100)::bigint::text AS cents,
                  (settled_at IS NOT NULL)::text AS settled, envelope_id::text AS env
           FROM transactions WHERE id = $1`,
          [undone.id],
        ),
      );
      expect(link.rows[0]).toMatchObject({
        r: purchase.id,
        cents: "3000",
        settled: "true",
        env: t.spendingId,
      });

      // The undone purchase leaves Plan's recent list.
      const plan = await planService.getPlan(t.tenantId, OWNER_ID);
      expect(plan.recentPurchases.map((p) => p.id)).not.toContain(purchase.id);

      await expect(
        transactionService.voidTransaction({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          transactionId: purchase.id,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      // An undo cannot itself be undone.
      await expect(
        transactionService.voidTransaction({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          transactionId: undone.id,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      // A member cannot undo.
      await expect(
        transactionService.voidTransaction({
          tenantId: t.tenantId,
          userId: MEMBER_ID,
          role: "member",
          transactionId: purchase.id,
        }),
      ).rejects.toThrow("Forbidden");
      expect(await balances(t)).toMatchObject({ spending: 10_000, bank: 100_000 });
    },
    90_000,
  );

  it(
    "undoing a bill payment returns the deficit to Spending and the rest to the bill",
    async () => {
      const t = await createTenant({ rentBalance: "200.00" });
      // Rent holds $200, the payment is $500: $300 came out of Spending.
      const paid = await transactionService.recordOutflow({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        amountCents: 50_000,
        scheduleId: t.rentScheduleId,
        idempotencyKey: randomUUID(),
      });
      expect(await balances(t)).toMatchObject({ rent: 0, spending: -20_000, bank: 50_000 });

      await transactionService.voidTransaction({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        transactionId: paid.id,
      });
      expect(await balances(t)).toMatchObject({ rent: 20_000, spending: 10_000, bank: 100_000 });
    },
    90_000,
  );

  it(
    "refuses to undo a payday",
    async () => {
      const t = await createTenant();
      const deposit = await transactionService.recordInflow({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        amountCents: 10_000,
        idempotencyKey: randomUUID(),
      });
      await expect(
        transactionService.voidTransaction({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          transactionId: deposit.id,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    },
    60_000,
  );

  it(
    "accepting a suggestion keeps the bill's schedule amount in step (D3)",
    async () => {
      const t = await createTenant();
      await bypass(async (q) => {
        await q(
          `INSERT INTO users (id, email, name)
           VALUES ($1, $2, 'Owner'), ($3, $4, 'Member')
           ON CONFLICT (id) DO NOTHING`,
          [OWNER_ID, `${OWNER_ID}@example.test`, MEMBER_ID, `${MEMBER_ID}@example.test`],
        );
      });

      const proposed = await planService.updateEnvelope({
        tenantId: t.tenantId,
        userId: MEMBER_ID,
        role: "member",
        envelopeId: t.rentId,
        payload: {
          name: "Rent",
          tierCategory: "fixed",
          targetCapCents: 60_000,
          monthlyInstallmentCents: null,
          amountEachPaydayCents: 60_000,
          dueDate: null,
        },
      });
      if (!("proposalId" in proposed)) throw new Error("expected a proposal");

      await planService.resolveProposal({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        proposalId: proposed.proposalId,
        decision: "accepted",
      });
      const schedule = await bypass((q) =>
        q(`SELECT (amount * 100)::bigint::text AS cents FROM scheduled_schedules WHERE id = $1`, [
          t.rentScheduleId,
        ]),
      );
      expect(schedule.rows[0].cents).toBe("60000");
    },
    90_000,
  );

  it(
    "marks a funded bill with no schedule paid by envelope id alone",
    async () => {
      const t = await createTenant({ rentBalance: "50.00" });
      const removed = await planService.removeEnvelope({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        envelopeId: t.rentId,
      });
      // It still holds money, so it stays on Plan with no schedule.
      expect(removed.archived).toBe(false);
      const plan = await planService.getPlan(t.tenantId, OWNER_ID);
      expect(plan.bills.find((b) => b.id === t.rentId)?.scheduleId).toBeNull();

      await transactionService.recordOutflow({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        amountCents: 5_000,
        envelopeId: t.rentId,
        idempotencyKey: randomUUID(),
      });
      expect(await balances(t)).toMatchObject({ rent: 0, spending: 10_000, bank: 95_000 });
    },
    90_000,
  );

  it(
    "moves a goal's leftover money to Spending, then lets it be removed",
    async () => {
      const t = await createTenant({ vacationBalance: "40.00" });
      await expect(
        planService.removeEnvelope({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          envelopeId: t.vacationId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);

      const moved = await planService.moveEnvelopeToSpending({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        envelopeId: t.vacationId,
      });
      expect(moved.movedCents).toBe(4_000);
      expect(await balances(t)).toMatchObject({ spending: 14_000, bank: 100_000 });

      const removed = await planService.removeEnvelope({
        tenantId: t.tenantId,
        userId: OWNER_ID,
        role: "owner",
        envelopeId: t.vacationId,
      });
      expect(removed.archived).toBe(true);

      // Nothing left to move, the sweep sink stays put, and a scheduled bill is refused.
      await expect(
        planService.moveEnvelopeToSpending({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          envelopeId: t.tripId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        planService.moveEnvelopeToSpending({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          envelopeId: t.emergencyId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        planService.moveEnvelopeToSpending({
          tenantId: t.tenantId,
          userId: OWNER_ID,
          role: "owner",
          envelopeId: t.rentId,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    },
    90_000,
  );

  it(
    "rests a tenant from catch-up after three failed midnights, and a success clears it",
    async () => {
      const t = await createTenant();
      const now = new Date();
      const pick = async (): Promise<{ ids: string[]; poisonSkipped: number }> => {
        const rows = await withTransaction(null, async (client) => {
          await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
          return loadTenantSnapshotRows(client);
        });
        // No snapshot yet, so this tenant is always stale.
        return selectCatchUpTenants(
          rows.filter((r) => r.id === t.tenantId),
          now,
        );
      };

      expect((await pick()).ids).toEqual([t.tenantId]);
      await recordMidnightOutcome(t.tenantId, false);
      await recordMidnightOutcome(t.tenantId, false);
      expect((await pick()).ids).toEqual([t.tenantId]);
      await recordMidnightOutcome(t.tenantId, false);
      const resting = await pick();
      expect(resting.ids).toEqual([]);
      expect(resting.poisonSkipped).toBe(1);

      const until = await bypass((q) =>
        q(
          `SELECT midnight_fail_count::text AS n,
                  (midnight_fail_until > NOW() + INTERVAL '23 hours')::text AS long
           FROM tenants WHERE id = $1`,
          [t.tenantId],
        ),
      );
      expect(until.rows[0]).toMatchObject({ n: "3", long: "true" });

      await recordMidnightOutcome(t.tenantId, true);
      expect((await pick()).ids).toEqual([t.tenantId]);
    },
    90_000,
  );

  it(
    "health reports the database, every shipped migration applied, and the cron age",
    async () => {
      const health = await loadHealth();
      expect(health.db).toBe(true);
      expect(health.migrations.expected).not.toBeNull();
      expect(health.migrations.applied).toBeGreaterThanOrEqual(health.migrations.expected ?? 0);
      expect(health.ok).toBe(true);
      expect(
        health.cronBatchAgeSec === null || Number.isInteger(health.cronBatchAgeSec),
      ).toBe(true);

      // An unreadable folder reads as unknown, not as a failure.
      const unknown = await loadHealth({ migrationsDir: "/nonexistent/orbit" });
      expect(unknown.migrations.expected).toBeNull();
      expect(unknown.ok).toBe(true);
    },
    60_000,
  );
});
