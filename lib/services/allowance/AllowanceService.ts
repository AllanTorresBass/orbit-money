import { withTransaction } from "@/lib/db/connection";
import { BaseService } from "@/lib/services/base/BaseService";
import { toCents } from "@/lib/money/numeric";

export interface AllowanceDto {
  sTodayCents: number;
  sDailyCents: number;
  nP: number;
  nextPayday: string | null;
  mitigated: boolean;
  asOfDate: string;
  tenantName: string;
  breachDate: string | null;
  warningDate: string | null;
}

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
      }>(
        `SELECT s_today::text, s_daily::text, n_p, next_payday::text, mitigated, as_of_date::text
         FROM allowance_snapshots WHERE tenant_id = $1`,
        [tenantId],
      );
      const row = snap.rows[0];
      if (!row) return null;

      const tenant = await client.query<{ name: string }>(
        `SELECT name FROM tenants WHERE id = $1`,
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

      return {
        sTodayCents: toCents(row.s_today),
        sDailyCents: toCents(row.s_daily),
        nP: row.n_p,
        nextPayday: row.next_payday,
        mitigated: row.mitigated,
        asOfDate: row.as_of_date,
        tenantName: tenant.rows[0]?.name ?? "Household",
        breachDate: breach.rows[0]?.forecast_date ?? null,
        warningDate: warning.rows[0]?.forecast_date ?? null,
      };
    });
  }
}

export const allowanceService = new AllowanceService();
