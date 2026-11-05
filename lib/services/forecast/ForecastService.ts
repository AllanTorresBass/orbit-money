import { withTransaction } from "@/lib/db/connection";
import { BaseService } from "@/lib/services/base/BaseService";
import { toCents } from "@/lib/money/numeric";

export interface ForecastDayDto {
  dayOffset: number;
  forecastDate: string;
  balanceCents: number;
  inflowCents: number;
  scheduledOutflowCents: number;
  assumedBurnCents: number;
  status: "ok" | "warning" | "breach";
}

export class ForecastService extends BaseService {
  constructor() {
    super("ForecastService");
  }

  async list(tenantId: string, userId: string): Promise<ForecastDayDto[]> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const result = await client.query<{
        day_offset: number;
        forecast_date: string;
        balance: string;
        inflow: string;
        scheduled_outflow: string;
        assumed_burn: string;
        status: "ok" | "warning" | "breach";
      }>(
        `SELECT day_offset, forecast_date::text, balance::text, inflow::text,
                scheduled_outflow::text, assumed_burn::text, status
         FROM forecast_days
         WHERE tenant_id = $1
         ORDER BY day_offset ASC`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        dayOffset: row.day_offset,
        forecastDate: row.forecast_date,
        balanceCents: toCents(row.balance),
        inflowCents: toCents(row.inflow),
        scheduledOutflowCents: toCents(row.scheduled_outflow),
        assumedBurnCents: toCents(row.assumed_burn),
        status: row.status,
      }));
    });
  }
}

export const forecastService = new ForecastService();
