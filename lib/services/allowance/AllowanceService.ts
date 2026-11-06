import { withTransaction } from "@/lib/db/connection";
import { BaseService } from "@/lib/services/base/BaseService";
import { toCents } from "@/lib/money/numeric";
import type { AllowanceDto } from "@/types/allowance/allowance.types";

export class AllowanceService extends BaseService {
  constructor() {
    super("AllowanceService");
  }

  async getCurrent(tenantId: string, userId: string): Promise<AllowanceDto | null> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const snap = await client.query<{
        s_today: string;
        s_daily: string;
        n_p: number;
        next_payday: string | null;
        mitigated: boolean;
        as_of_date: string;
        forecast_stale: boolean;
      }>(
        `SELECT s_today::text, s_daily::text, n_p, next_payday::text, mitigated, as_of_date::text,
                forecast_stale
         FROM allowance_snapshots WHERE tenant_id = $1`,
        [tenantId],
      );
      const row = snap.rows[0];
      if (!row) return null;

      const tenant = await client.query<{ name: string; liquidity_floor: string }>(
        `SELECT name, liquidity_floor::text FROM tenants WHERE id = $1`,
        [tenantId],
      );

      const bank = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(current_balance), 0)::text AS total
         FROM accounts WHERE tenant_id = $1`,
        [tenantId],
      );

      const spending = await client.query<{ balance: string }>(
        `SELECT current_balance::text AS balance FROM envelopes
         WHERE tenant_id = $1 AND tier_category = 'discretionary'`,
        [tenantId],
      );

      const purchases = await client.query<{ has_purchase: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM transactions WHERE tenant_id = $1 AND amount < 0
         ) AS has_purchase`,
        [tenantId],
      );

      const breach = await client.query<{ forecast_date: string }>(
        `SELECT forecast_date::text FROM forecast_days
         WHERE tenant_id = $1 AND status = 'breach' AND day_offset >= 1
         ORDER BY day_offset ASC LIMIT 1`,
        [tenantId],
      );
      const warning = await client.query<{ forecast_date: string }>(
        `SELECT forecast_date::text FROM forecast_days
         WHERE tenant_id = $1 AND status = 'warning' AND day_offset >= 1
         ORDER BY day_offset ASC LIMIT 1`,
        [tenantId],
      );

      const tomorrow = await client.query<{ assumed_burn: string }>(
        `SELECT assumed_burn::text FROM forecast_days
         WHERE tenant_id = $1 AND day_offset = 1
         LIMIT 1`,
        [tenantId],
      );
      const sDailyCents = toCents(row.s_daily);
      const tomorrowBurnCents = tomorrow.rows[0]
        ? toCents(tomorrow.rows[0].assumed_burn)
        : sDailyCents;

      return {
        sTodayCents: toCents(row.s_today),
        sDailyCents,
        tomorrowBurnCents,
        nP: row.n_p,
        nextPayday: row.next_payday,
        mitigated: row.mitigated,
        asOfDate: row.as_of_date,
        tenantName: tenant.rows[0]?.name ?? "Household",
        breachDate: breach.rows[0]?.forecast_date ?? null,
        warningDate: warning.rows[0]?.forecast_date ?? null,
        bankTotalCents: toCents(bank.rows[0]?.total ?? "0"),
        keepAtLeastCents: toCents(tenant.rows[0]?.liquidity_floor ?? "0"),
        forecastStale: row.forecast_stale,
        spendingBalanceCents: toCents(spending.rows[0]?.balance ?? "0"),
        hasPurchaseHistory: purchases.rows[0]?.has_purchase ?? false,
      };
    });
  }
}

export const allowanceService = new AllowanceService();
