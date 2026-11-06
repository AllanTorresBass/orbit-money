import { NextRequest, NextResponse } from "next/server";
import { localHourInTimezone, todayInTimezone } from "@/lib/calendar/dates";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { withTransaction } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  finishCronBatch,
  finishStaleCronBatches,
  startCronBatch,
} from "@/lib/pipeline/cron-batch";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { decideForceAll, FORCE_ALL_HEADER } from "@/lib/pipeline/force-all";
import { recordMidnightOutcome } from "@/lib/pipeline/midnight-failures";
import {
  CATCH_UP_LIMIT,
  loadTenantSnapshotRows,
  selectCatchUpTenants,
  selectHourZeroSkippedTenantIds,
} from "@/lib/pipeline/stale-tenants";
import { closeAbandonedPipelineRuns, prunePipelineRuns } from "@/lib/pipeline/telemetry";
import { withPipelineRun } from "@/lib/pipeline/with-run";
import { mapWithConcurrency } from "@/lib/utils/promise-pool";
import type { TenantSnapshotRow } from "@/types/pipeline/pipeline.types";

/** Vercel function budget for one tick: hour-0 tenants plus the capped catch-up set. */
export const maxDuration = 60;

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
/** Tenants evaluated at once. Each holds one pooled connection for its transaction. */
const TENANT_CONCURRENCY = 4;
const RUN_RETENTION_DAYS = 90;
/** A run still `running` after this long crashed without cleanup. */
const ABANDONED_RUN_MINUTES = 60;
/** A batch still unfinished after this long belongs to a tick that crashed or timed out. */
const STALE_BATCH_MINUTES = 120;
const RATE_LIMIT_RETENTION_SECONDS = 24 * 60 * 60;
/** Stop starting tenants this long before `maxDuration`, so the tick can close its batch. */
const DEADLINE_HEADROOM_MS = 10_000;

interface TenantResult {
  tenantId: string;
  ok: boolean;
  /** Not due this tick. */
  skipped?: boolean;
  /** Due, but the deadline arrived first. The next tick's catch-up picks it up. */
  deferred?: boolean;
  runId?: string;
}

async function runMidnight(request: NextRequest): Promise<NextResponse> {
  const tickStarted = Date.now();
  const deadline = tickStarted + maxDuration * 1000 - DEADLINE_HEADROOM_MS;
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

    const forceDecision = decideForceAll({
      allParam: request.nextUrl.searchParams.get("all"),
      headerValue: request.headers.get(FORCE_ALL_HEADER),
    });
    if (forceDecision === "rejected") {
      logger.warn("Midnight force-all rejected: confirmation header missing");
      return NextResponse.json(
        { error: `Forcing every tenant also needs the ${FORCE_ALL_HEADER}: 1 header` },
        { status: 403 },
      );
    }
    const forceAll = forceDecision === "forced";
    const now = new Date();

    // Close ticks that never finished, so Activity does not show them as running forever.
    const closedStaleAtStart = await finishStaleCronBatches({ minutes: STALE_BATCH_MINUTES });

    const tenants = await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      return loadTenantSnapshotRows(client);
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
    const hourZeroCount = dueTenantIds.size;

    // A zone whose clock skipped 00:00 today never hits hour 0. Its tenants run once the gap
    // has passed, ahead of the capped catch-up set.
    const dstSkippedIds = forceAll
      ? []
      : selectHourZeroSkippedTenantIds(tenants, now, dueTenantIds);
    for (const id of dstSkippedIds) dueTenantIds.add(id);

    // Catch-up: tenants a missed hour-0 tick left on yesterday's numbers (or none), capped.
    // Tenants whose midnight run failed three times running are rested for a day.
    const catchUp = forceAll
      ? { ids: [], staleBacklog: 0, poisonSkipped: 0 }
      : selectCatchUpTenants(tenants, now, { limit: CATCH_UP_LIMIT, alreadyDue: dueTenantIds });
    const catchUpIds = catchUp.ids;
    for (const id of catchUpIds) dueTenantIds.add(id);

    // Due tenants first (hour 0, then DST gap, then catch-up), so a deadline defers the
    // least urgent ones.
    const dueRank = new Map<string, number>();
    for (const id of dueTenantIds) dueRank.set(id, 0);
    for (const id of dstSkippedIds) dueRank.set(id, 1);
    for (const id of catchUpIds) dueRank.set(id, 2);
    const ordered = [...tenants].sort(
      (a, b) => (dueRank.get(a.id) ?? 3) - (dueRank.get(b.id) ?? 3),
    );

    const batchMeta = {
      tenantCount: tenants.length,
      timezoneCount: byTimezone.size,
      forceAll,
      hourZeroCount,
      dstSkippedCount: dstSkippedIds.length,
      catchUp: catchUpIds.length > 0,
      catchUpCount: catchUpIds.length,
      staleBacklog: catchUp.staleBacklog,
      poisonSkipped: catchUp.poisonSkipped,
      closedStaleAtStart,
    };
    const cronBatchId = await startCronBatch({ dueCount: dueTenantIds.size, meta: batchMeta });

    logger.info("Midnight cron start", {
      cronBatchId,
      tenantCount: tenants.length,
      dueCount: dueTenantIds.size,
      timezoneCount: byTimezone.size,
      forceAll,
      catchUpCount: catchUpIds.length,
      dstSkippedCount: dstSkippedIds.length,
      staleBacklog: catchUp.staleBacklog,
      poisonSkipped: catchUp.poisonSkipped,
    });

    const results = await mapWithConcurrency<TenantSnapshotRow, TenantResult>(
      ordered,
      TENANT_CONCURRENCY,
      async (tenant) => {
        if (!dueTenantIds.has(tenant.id)) {
          return { tenantId: tenant.id, ok: true, skipped: true };
        }
        if (Date.now() > deadline) {
          return { tenantId: tenant.id, ok: true, deferred: true };
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
          await recordMidnightOutcome(tenant.id, true);
          return { tenantId: tenant.id, ok: true, runId: summary.runId };
        } catch (error: unknown) {
          logger.error("Midnight failed for tenant", {
            cronBatchId,
            tenantId: tenant.id,
            error: error instanceof Error ? error.message : "unknown",
          });
          await recordMidnightOutcome(tenant.id, false);
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
      // Magic-link counters older than a day carry no information.
      await pruneRateLimits(RATE_LIMIT_RETENTION_SECONDS);
    } catch (error: unknown) {
      logger.error("Pipeline retention failed", {
        cronBatchId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    const closedStaleAtEnd = await finishStaleCronBatches({
      minutes: STALE_BATCH_MINUTES,
      excludeId: cronBatchId,
    });
    const okCount = results.filter((r) => r.ok && !r.skipped && !r.deferred).length;
    const errorCount = results.filter((r) => !r.ok).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const unprocessedDue = results.filter((r) => r.deferred).length;
    const deadlineHit = unprocessedDue > 0;
    const durationMs = Date.now() - tickStarted;
    await finishCronBatch(
      cronBatchId,
      { dueCount: dueTenantIds.size, okCount, errorCount, skippedCount },
      {
        pruned,
        closedAbandoned: closed,
        closedStaleAtEnd,
        catchUpCount: catchUpIds.length,
        durationMs,
        unprocessedDue,
        staleBacklog: catchUp.staleBacklog,
        deadlineHit,
        poisonSkipped: catchUp.poisonSkipped,
      },
    );
    logger.info("Midnight cron done", {
      cronBatchId,
      ran: dueTenantIds.size,
      okCount,
      errorCount,
      skippedCount,
      pruned,
      closed,
      durationMs,
      unprocessedDue,
      staleBacklog: catchUp.staleBacklog,
      deadlineHit,
      poisonSkipped: catchUp.poisonSkipped,
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
      catchUpCount: catchUpIds.length,
      dstSkippedCount: dstSkippedIds.length,
      durationMs,
      unprocessedDue,
      staleBacklog: catchUp.staleBacklog,
      deadlineHit,
      poisonSkipped: catchUp.poisonSkipped,
      closedStaleBatches: closedStaleAtStart + closedStaleAtEnd,
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
