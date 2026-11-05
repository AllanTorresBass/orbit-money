import { canConfigure, type MembershipRole } from "@/lib/auth/permissions";
import { withTransaction } from "@/lib/db/connection";
import { toCents } from "@/lib/money/numeric";
import { BaseService } from "@/lib/services/base/BaseService";
import type { PipelineRunListItem } from "@/types/pipeline/pipeline.types";

export class PipelineService extends BaseService {
  constructor() {
    super("PipelineService");
  }

  async listRuns(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    asOfDate?: string;
    limit?: number;
  }): Promise<PipelineRunListItem[]> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      const result = await client.query<{
        id: string;
        trigger: "sync" | "midnight";
        as_of_date: string;
        started_at: Date;
        finished_at: Date | null;
        status: string;
        forecast_stale: boolean;
        cuts_applied: number;
        o_unfunded: string | null;
        s_daily: string | null;
        s_today: string | null;
        n_p: number | null;
        sweep_incomplete: boolean;
        cron_batch_id: string | null;
      }>(
        input.asOfDate
          ? `SELECT id, trigger, as_of_date::text, started_at, finished_at, status,
                    forecast_stale, cuts_applied, o_unfunded::text, s_daily::text, s_today::text,
                    n_p, sweep_incomplete, cron_batch_id
             FROM pipeline_runs
             WHERE tenant_id = $1 AND as_of_date = $2::date
             ORDER BY started_at DESC
             LIMIT $3`
          : `SELECT id, trigger, as_of_date::text, started_at, finished_at, status,
                    forecast_stale, cuts_applied, o_unfunded::text, s_daily::text, s_today::text,
                    n_p, sweep_incomplete, cron_batch_id
             FROM pipeline_runs
             WHERE tenant_id = $1
             ORDER BY started_at DESC
             LIMIT $2`,
        input.asOfDate
          ? [input.tenantId, input.asOfDate, limit]
          : [input.tenantId, limit],
      );

      return result.rows.map((row) => ({
        id: row.id,
        trigger: row.trigger,
        asOfDate: row.as_of_date,
        startedAt: row.started_at.toISOString(),
        finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
        status: row.status,
        forecastStale: row.forecast_stale,
        cutsApplied: row.cuts_applied,
        oUnfundedCents: row.o_unfunded === null ? null : toCents(row.o_unfunded),
        sDailyCents: row.s_daily === null ? null : toCents(row.s_daily),
        sTodayCents: row.s_today === null ? null : toCents(row.s_today),
        nP: row.n_p,
        sweepIncomplete: row.sweep_incomplete,
        cronBatchId: row.cron_batch_id,
      }));
    });
  }
}

export const pipelineService = new PipelineService();
