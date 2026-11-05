import { withTransaction } from "@/lib/db/connection";
import { BaseService } from "@/lib/services/base/BaseService";
import { toCents } from "@/lib/money/numeric";
import type {
  ForecastDayDetailDto,
  ForecastDayDto,
  ForecastStatus,
} from "@/types/forecast/forecast.types";

interface ForecastDayRow {
  day_offset: number;
  forecast_date: string;
  balance: string;
  inflow: string;
  scheduled_outflow: string;
  assumed_burn: string;
  status: ForecastStatus;
}

function mapRow(row: ForecastDayRow): ForecastDayDto {
  return {
    dayOffset: row.day_offset,
    forecastDate: row.forecast_date,
    balanceCents: toCents(row.balance),
    inflowCents: toCents(row.inflow),
    scheduledOutflowCents: toCents(row.scheduled_outflow),
    assumedBurnCents: toCents(row.assumed_burn),
    status: row.status,
  };
}

export class ForecastService extends BaseService {
  constructor() {
    super("ForecastService");
  }

  async list(tenantId: string, userId: string): Promise<ForecastDayDto[]> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const result = await client.query<ForecastDayRow>(
        `SELECT day_offset, forecast_date::text, balance::text, inflow::text,
                scheduled_outflow::text, assumed_burn::text, status
         FROM forecast_days
         WHERE tenant_id = $1
         ORDER BY day_offset ASC`,
        [tenantId],
      );
      return result.rows.map(mapRow);
    });
  }

  /** One forecast day (`YYYY-MM-DD`) plus the keep-at-least amount. Null when outside the 60-day window. */
  async getDay(
    tenantId: string,
    userId: string,
    date: string,
  ): Promise<ForecastDayDetailDto | null> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const result = await client.query<ForecastDayRow>(
        `SELECT day_offset, forecast_date::text, balance::text, inflow::text,
                scheduled_outflow::text, assumed_burn::text, status
         FROM forecast_days
         WHERE tenant_id = $1 AND forecast_date = $2::date`,
        [tenantId, date],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const tenant = await client.query<{ liquidity_floor: string }>(
        `SELECT liquidity_floor::text FROM tenants WHERE id = $1`,
        [tenantId],
      );

      return {
        ...mapRow(row),
        keepAtLeastCents: toCents(tenant.rows[0]?.liquidity_floor ?? "0"),
      };
    });
  }
}

export const forecastService = new ForecastService();
