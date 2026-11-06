import { NextRequest, NextResponse } from "next/server";
import { localHourInTimezone, todayInTimezone } from "@/lib/calendar/dates";
import { withTransaction } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { finishCronBatch, startCronBatch } from "@/lib/pipeline/cron-batch";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { closeAbandonedPipelineRuns, prunePipelineRuns } from "@/lib/pipeline/telemetry";
import { withPipelineRun } from "@/lib/pipeline/with-run";
import { mapWithConcurrency } from "@/lib/utils/promise-pool";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
/** Tenants evaluated at once. Each holds one pooled connection for its transaction. */
const TENANT_CONCURRENCY = 4;
const RUN_RETENTION_DAYS = 90;
/** A run still `running` after this long crashed without cleanup. */
const ABANDONED_RUN_MINUTES = 60;

interface TenantResult {
  tenantId: string;
  ok: boolean;
  skipped?: boolean;
  runId?: string;
}

async function runMidnight(request: NextRequest): Promise<NextResponse> {
  try {
    const secret = getEnv().CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const cronHeader = request.headers.get("x-vercel-cron");
    // Bearer only — x-vercel-cron is advisory (logged), never sufficient alone.
    if (authHeader !== `Bearer ${secret}`) {
      logger.info("Midnight cron rejected", {
        hasCronHeader: Boolean(cronHeader),
        hasBearer: Boolean(authHeader?.startsWith("Bearer ")),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const forceAll = request.nextUrl.searchParams.get("all") === "1";
    const now = new Date();

    const tenants = await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const result = await client.query<{ id: string; timezone: string }>(
        `SELECT id, timezone FROM tenants`,
      );
      return result.rows;
    });

    // Group by timezone so we only evaluate tenants whose local hour is midnight.
    const byTimezone = new Map<string, string[]>();
    for (const tenant of tenants) {
      const list = byTimezone.get(tenant.timezone) ?? [];
      list.push(tenant.id);
      byTimezone.set(tenant.timezone, list);
    }

    const dueTenantIds = new Set<string>();
    for (const [timezone, ids] of byTimezone) {
      if (forceAll || localHourInTimezone(timezone, now) === 0) {
        for (const id of ids) dueTenantIds.add(id);
      }
    }

    const batchMeta = {
      tenantCount: tenants.length,
      timezoneCount: byTimezone.size,
      forceAll,
    };
    const cronBatchId = await startCronBatch({ dueCount: dueTenantIds.size, meta: batchMeta });

    logger.info("Midnight cron start", {
      cronBatchId,
      tenantCount: tenants.length,
      dueCount: dueTenantIds.size,
      timezoneCount: byTimezone.size,
      forceAll,
    });

    const results = await mapWithConcurrency<{ id: string; timezone: string }, TenantResult>(
      tenants,
      TENANT_CONCURRENCY,
      async (tenant) => {
        if (!dueTenantIds.has(tenant.id)) {
          return { tenantId: tenant.id, ok: true, skipped: true };
        }
        try {
          const asOfDate = todayInTimezone(tenant.timezone, now);
          // The run row commits on its own connection first, so a rollback or crash leaves it.
          const summary = await withPipelineRun(
            { tenantId: tenant.id, trigger: "midnight", asOfDate, cronBatchId },
            (run) =>
              withTransaction({ tenantId: tenant.id, userId: SYSTEM_USER_ID }, async (client) => {
                await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
                return runEvaluationPipeline(client, {
                  tenantId: tenant.id,
                  userId: SYSTEM_USER_ID,
                  trigger: "midnight",
                  asOfDate,
                  cronBatchId,
                  runId: run.runId,
                  runPreStarted: true,
                });
              }),
          );
          return { tenantId: tenant.id, ok: true, runId: summary.runId };
        } catch (error: unknown) {
          logger.error("Midnight failed for tenant", {
            cronBatchId,
            tenantId: tenant.id,
            error: error instanceof Error ? error.message : "unknown",
          });
          return { tenantId: tenant.id, ok: false };
        }
      },
    );

    // Tail: retention and crash cleanup. A failure here never fails the tick.
    let pruned = 0;
    let closed = 0;
    try {
      const housekeeping = await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        return {
          pruned: await prunePipelineRuns(client, RUN_RETENTION_DAYS),
          closed: await closeAbandonedPipelineRuns(client, ABANDONED_RUN_MINUTES),
        };
      });
      pruned = housekeeping.pruned;
      closed = housekeeping.closed;
    } catch (error: unknown) {
      logger.error("Pipeline retention failed", {
        cronBatchId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    const okCount = results.filter((r) => r.ok && !r.skipped).length;
    const errorCount = results.filter((r) => !r.ok).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    await finishCronBatch(
      cronBatchId,
      { dueCount: dueTenantIds.size, okCount, errorCount, skippedCount },
      { pruned, closedAbandoned: closed },
    );
    logger.info("Midnight cron done", {
      cronBatchId,
      ran: dueTenantIds.size,
      okCount,
      errorCount,
      skippedCount,
      pruned,
      closed,
    });

    return NextResponse.json({
      ok: true,
      cronBatchId,
      ran: dueTenantIds.size,
      okCount,
      errorCount,
      skippedCount,
      pruned,
      closedAbandoned: closed,
      results,
    });
  } catch (error: unknown) {
    logger.error("Midnight cron failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return runMidnight(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runMidnight(request);
}
