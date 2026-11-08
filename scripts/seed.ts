import { config } from "dotenv";
import { HARBOR } from "../lib/dev/harbor-ids";
import { getUnpooledPool } from "../lib/db/connection";
import { logger } from "../lib/logger";

config({ path: ".env" });

/**
 * Default: post-paycheck demo (paycheck settled, Spending 1,570, checking 5,000).
 * `PRE_PAYCHECK=1` or `--pre-paycheck`: docs/09 starting balances, paycheck not yet posted.
 */
const PRE_PAYCHECK = process.env.PRE_PAYCHECK === "1" || process.argv.includes("--pre-paycheck");

const BALANCES = PRE_PAYCHECK
  ? { checking: "2000.00", rent: "0.00", electric: "40.00", car: "400.00", vacation: "1000.00", spending: "80.00" }
  : { checking: "5000.00", rent: "1200.00", electric: "150.00", car: "600.00", vacation: "1000.00", spending: "1570.00" };

async function main(): Promise<void> {
  const pool = getUnpooledPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");

    await client.query(
      `INSERT INTO tenants (id, name, tenant_type, base_currency, timezone, holiday_region, liquidity_floor)
       VALUES ($1, 'Harbor', 'household', 'USD', 'America/New_York', 'US', 200.00)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         liquidity_floor = EXCLUDED.liquidity_floor,
         timezone = EXCLUDED.timezone`,
      [HARBOR.tenantId],
    );

    const users = [
      [HARBOR.alexId, "alex@harbor.test", "Alex"],
      [HARBOR.blairId, "blair@harbor.test", "Blair"],
      [HARBOR.caseyId, "casey@harbor.test", "Casey"],
    ] as const;
    for (const [id, email, name] of users) {
      await client.query(
        `INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name`,
        [id, email, name],
      );
    }

    const memberships = [
      [HARBOR.alexId, "owner"],
      [HARBOR.blairId, "member"],
      [HARBOR.caseyId, "advisor"],
    ] as const;
    for (const [userId, role] of memberships) {
      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
        [HARBOR.tenantId, userId, role],
      );
    }

    await client.query(
      `INSERT INTO accounts (id, tenant_id, name, current_balance, is_everyday, updated_at)
       VALUES ($1, $2, 'Checking', $3, TRUE, NOW())
       ON CONFLICT (id) DO UPDATE SET current_balance = EXCLUDED.current_balance, updated_at = NOW()`,
      [HARBOR.accountId, HARBOR.tenantId, BALANCES.checking],
    );

    // Clear dependent rows for re-seed
    await client.query("DELETE FROM forecast_days WHERE tenant_id = $1", [HARBOR.tenantId]);
    await client.query("DELETE FROM allowance_snapshots WHERE tenant_id = $1", [HARBOR.tenantId]);
    await client.query("DELETE FROM allocations WHERE tenant_id = $1", [HARBOR.tenantId]);
    await client.query("DELETE FROM transactions WHERE tenant_id = $1", [HARBOR.tenantId]);
    await client.query("DELETE FROM scheduled_schedules WHERE tenant_id = $1", [HARBOR.tenantId]);
    await client.query("DELETE FROM cycle_sweeps WHERE tenant_id = $1", [HARBOR.tenantId]);
    await client.query("DELETE FROM envelopes WHERE tenant_id = $1", [HARBOR.tenantId]);

    await client.query(
      `INSERT INTO envelopes (id, tenant_id, name, tier_category, priority_order, current_balance, target_cap, monthly_installment, rollover_policy)
       VALUES
         ($1, $7, 'Rent', 'fixed', 1, $8, 1200.00, NULL, 'top_up'),
         ($2, $7, 'Electricity', 'fixed', 2, $9, 150.00, NULL, 'top_up'),
         ($3, $7, 'Car insurance', 'sinking', 1, $10, 1000.00, 200.00, 'accumulate'),
         ($4, $7, 'Vacation', 'sinking', 2, $11, 1000.00, 100.00, 'accumulate'),
         ($5, $7, 'Emergency', 'sinking', 3, 0.00, NULL, 0.00, 'accumulate'),
         ($6, $7, 'Spending', 'discretionary', 1, $12, NULL, NULL, 'reset_sweep')`,
      [
        HARBOR.rentId,
        HARBOR.electricId,
        HARBOR.carId,
        HARBOR.vacationId,
        HARBOR.emergencyId,
        HARBOR.spendingId,
        HARBOR.tenantId,
        BALANCES.rent,
        BALANCES.electric,
        BALANCES.car,
        BALANCES.vacation,
        BALANCES.spending,
      ],
    );

    await client.query(
      `UPDATE envelopes SET sweep_envelope_id = $1 WHERE id = $2`,
      [HARBOR.carId, HARBOR.spendingId],
    );

    await client.query(
      `INSERT INTO scheduled_schedules
         (id, tenant_id, envelope_id, account_id, title, amount, direction, recurrence_rrule, next_due_date, is_active)
       VALUES
         ($1, $3, $4, $5, 'Rent', 1200.00, 'outflow', 'FREQ=MONTHLY;BYMONTHDAY=13', '2026-11-13', TRUE),
         ($2, $3, NULL, $5, 'Payday', 3000.00, 'inflow', 'FREQ=WEEKLY;INTERVAL=2', '2026-11-18', TRUE)`,
      [
        HARBOR.rentScheduleId,
        HARBOR.paydayScheduleId,
        HARBOR.tenantId,
        HARBOR.rentId,
        HARBOR.accountId,
      ],
    );

    if (!PRE_PAYCHECK) {
      await client.query(
        `INSERT INTO transactions
           (id, tenant_id, account_id, envelope_id, amount, booked_at, booked_date, memo, settled_at, idempotency_key)
         VALUES
           ($1, $2, $3, NULL, 3000.00, '2026-11-04T15:00:00Z', '2026-11-04', 'Payday', NOW(), 'seed-paycheck-2026-11-04')`,
        [HARBOR.paycheckTxnId, HARBOR.tenantId, HARBOR.accountId],
      );

      await client.query(
        `INSERT INTO allowance_snapshots
           (tenant_id, as_of_date, s_daily, s_today, n_p, o_unfunded, mitigated, next_payday, computed_at)
         VALUES ($1, '2026-11-04', 112.14, 112.18, 14, 0.00, FALSE, '2026-11-18', NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           as_of_date = EXCLUDED.as_of_date,
           s_daily = EXCLUDED.s_daily,
           s_today = EXCLUDED.s_today,
           n_p = EXCLUDED.n_p,
           next_payday = EXCLUDED.next_payday,
           computed_at = NOW()`,
        [HARBOR.tenantId],
      );

      // Minimal forecast day 0 for Ahead
      await client.query(
        `INSERT INTO forecast_days
           (tenant_id, day_offset, forecast_date, balance, inflow, scheduled_outflow, assumed_burn, status)
         VALUES ($1, 0, '2026-11-04', 5000.00, 0, 0, 0, 'ok')
         ON CONFLICT (tenant_id, day_offset) DO UPDATE SET balance = 5000.00`,
        [HARBOR.tenantId],
      );
    }

    await client.query("COMMIT");
    logger.info("Harbor seed complete", {
      tenantId: HARBOR.tenantId,
      blairId: HARBOR.blairId,
      mode: PRE_PAYCHECK ? "pre-paycheck (docs/09 start)" : "post-paycheck demo",
    });
    if (PRE_PAYCHECK) {
      logger.info("Post Alex's $3,000 paycheck on 2026-11-04 to run walkthrough A");
    } else {
      logger.info("Run npm run db:refresh to recompute the 60-day forecast");
    }
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error("Seed failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
