import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { toCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { pipelineService } from "@/lib/services/pipeline/PipelineService";
import { transactionService } from "@/lib/services/transactions/TransactionService";

config({ path: ".env" });

describe("Harbor walkthrough purchase", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it(
    "records $40 and leaves Spending 1530 with S_today 72.18",
    async () => {
    await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");

      // Reset to post-paycheck walkthrough balances (docs/09).
      await client.query(
        `UPDATE accounts SET current_balance = 5000.00, updated_at = NOW()
         WHERE id = $1`,
        [HARBOR.accountId],
      );
      await client.query(
        `UPDATE envelopes SET current_balance = 1570.00 WHERE id = $1`,
        [HARBOR.spendingId],
      );
      await client.query(
        `DELETE FROM transactions
         WHERE tenant_id = $1 AND envelope_id = $2 AND amount < 0`,
        [HARBOR.tenantId, HARBOR.spendingId],
      );
      await client.query(
        `INSERT INTO allowance_snapshots
           (tenant_id, as_of_date, s_daily, s_today, n_p, o_unfunded, mitigated, next_payday)
         VALUES ($1, '2026-11-04', 112.14, 112.18, 14, 0, FALSE, '2026-11-18')
         ON CONFLICT (tenant_id) DO UPDATE SET
           as_of_date = '2026-11-04',
           s_daily = 112.14,
           s_today = 112.18,
           n_p = 14,
           mitigated = FALSE,
           next_payday = '2026-11-18'`,
        [HARBOR.tenantId],
      );

      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
        HARBOR.tenantId,
      ]);
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [HARBOR.blairId]);
      await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

      await runEvaluationPipeline(client, {
        tenantId: HARBOR.tenantId,
        userId: HARBOR.blairId,
        trigger: "sync",
        asOfDate: "2026-11-04",
      });
    });

    await transactionService.createPurchase({
      tenantId: HARBOR.tenantId,
      userId: HARBOR.blairId,
      role: "member",
      amountCents: 4000,
      idempotencyKey: `walkthrough-40-${Date.now()}`,
      memo: "Purchase",
      asOfDate: "2026-11-04",
    });

    const snapshot = await withTransaction(
      { tenantId: HARBOR.tenantId, userId: HARBOR.blairId },
      async (client) => {
        const spend = await client.query<{ current_balance: string }>(
          `SELECT current_balance::text FROM envelopes WHERE id = $1`,
          [HARBOR.spendingId],
        );
        const account = await client.query<{ current_balance: string }>(
          `SELECT current_balance::text FROM accounts WHERE id = $1`,
          [HARBOR.accountId],
        );
        const allowance = await client.query<{ s_today: string; s_daily: string }>(
          `SELECT s_today::text, s_daily::text FROM allowance_snapshots WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        return {
          spendingCents: toCents(spend.rows[0]?.current_balance ?? "0"),
          checkingCents: toCents(account.rows[0]?.current_balance ?? "0"),
          sTodayCents: toCents(allowance.rows[0]?.s_today ?? "0"),
          sDailyCents: toCents(allowance.rows[0]?.s_daily ?? "0"),
        };
      },
    );

    expect(snapshot.checkingCents).toBe(496_000);
    expect(snapshot.spendingCents).toBe(153_000);
    expect(snapshot.sDailyCents).toBe(11_214);
    expect(snapshot.sTodayCents).toBe(7_218);

    // Observability: the purchase wrote a finished run with ordered steps, and owners can read it.
    const listed = await pipelineService.listRuns({
      tenantId: HARBOR.tenantId,
      userId: HARBOR.alexId,
      role: "owner",
      asOfDate: "2026-11-04",
      limit: 1,
      includeSteps: true,
    });
    const latest = listed.runs[0];
    expect(latest).toBeDefined();
    expect(latest.status).toBe("ok");
    const stepNames = (latest.steps ?? []).map((step: { step: string }) => step.step);
    expect(stepNames).toEqual(
      expect.arrayContaining(["settle", "rate", "project", "floor_check", "publish"]),
    );
    expect(stepNames[0]).toBe("settle");
    expect(stepNames[stepNames.length - 1]).toBe("publish");
    const single = await pipelineService.getRun({
      tenantId: HARBOR.tenantId,
      userId: HARBOR.alexId,
      role: "owner",
      runId: latest.id,
    });
    expect(single?.steps?.length).toBe(latest.steps?.length);
    await expect(
      pipelineService.listRuns({
        tenantId: HARBOR.tenantId,
        userId: HARBOR.blairId,
        role: "member",
      }),
    ).rejects.toThrow("Forbidden");
    },
    30_000,
  );

  it(
    "B overspend $150 → S_today -37.82 and future burn 109.23",
    async () => {
      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        await client.query(
          `UPDATE accounts SET current_balance = 5000.00, updated_at = NOW()
           WHERE id = $1`,
          [HARBOR.accountId],
        );
        await client.query(
          `UPDATE envelopes SET current_balance = 1570.00 WHERE id = $1`,
          [HARBOR.spendingId],
        );
        await client.query(
          `DELETE FROM transactions
           WHERE tenant_id = $1 AND envelope_id = $2 AND amount < 0`,
          [HARBOR.tenantId, HARBOR.spendingId],
        );
        await client.query("SELECT set_config('app.bypass_rls', 'off', true)");
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          HARBOR.tenantId,
        ]);
        await client.query("SELECT set_config('app.current_user_id', $1, true)", [HARBOR.blairId]);
        await runEvaluationPipeline(client, {
          tenantId: HARBOR.tenantId,
          userId: HARBOR.blairId,
          trigger: "sync",
          asOfDate: "2026-11-04",
        });
      });

      await transactionService.createPurchase({
        tenantId: HARBOR.tenantId,
        userId: HARBOR.blairId,
        role: "member",
        amountCents: 15_000,
        idempotencyKey: `walkthrough-150-${Date.now()}`,
        memo: "Overspend",
        asOfDate: "2026-11-04",
      });

      const snapshot = await withTransaction(
        { tenantId: HARBOR.tenantId, userId: HARBOR.blairId },
        async (client) => {
          const allowance = await client.query<{ s_today: string; s_daily: string }>(
            `SELECT s_today::text, s_daily::text FROM allowance_snapshots WHERE tenant_id = $1`,
            [HARBOR.tenantId],
          );
          const burn = await client.query<{ assumed_burn: string }>(
            `SELECT assumed_burn::text FROM forecast_days
             WHERE tenant_id = $1 AND day_offset = 1`,
            [HARBOR.tenantId],
          );
          return {
            sTodayCents: toCents(allowance.rows[0]?.s_today ?? "0"),
            sDailyCents: toCents(allowance.rows[0]?.s_daily ?? "0"),
            futureBurnCents: toCents(burn.rows[0]?.assumed_burn ?? "0"),
          };
        },
      );

      expect(snapshot.sDailyCents).toBe(11_214);
      expect(snapshot.sTodayCents).toBe(-3_782);
      expect(snapshot.futureBurnCents).toBe(10_923);
    },
    30_000,
  );

  it(
    "C midnight next day → S_daily 117.69 from Spending 1530 / 13",
    async () => {
      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        await client.query(
          `UPDATE accounts SET current_balance = 4960.00, updated_at = NOW()
           WHERE id = $1`,
          [HARBOR.accountId],
        );
        await client.query(
          `UPDATE envelopes SET current_balance = 1530.00 WHERE id = $1`,
          [HARBOR.spendingId],
        );
        await client.query(
          `DELETE FROM transactions
           WHERE tenant_id = $1 AND envelope_id = $2 AND amount < 0`,
          [HARBOR.tenantId, HARBOR.spendingId],
        );
        // Seed a settled $40 so E_disc on Nov 5 is zero (booked prior day).
        await client.query(
          `INSERT INTO transactions
             (tenant_id, account_id, envelope_id, amount, booked_at, booked_date, memo, idempotency_key, settled_at)
           VALUES ($1, $2, $3, -40.00, '2026-11-04T12:00:00Z', '2026-11-04', 'Grocery', $4, NOW())
           ON CONFLICT DO NOTHING`,
          [HARBOR.tenantId, HARBOR.accountId, HARBOR.spendingId, `c-midnight-40-${Date.now()}`],
        );
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
          HARBOR.tenantId,
        ]);
        await client.query("SELECT set_config('app.current_user_id', $1, true)", [HARBOR.alexId]);
        await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

        const result = await runEvaluationPipeline(client, {
          tenantId: HARBOR.tenantId,
          userId: HARBOR.alexId,
          trigger: "midnight",
          asOfDate: "2026-11-05",
        });

        expect(result.sDailyCents).toBe(11_769);
        expect(result.nP).toBe(13);
      });
    },
    30_000,
  );
});
