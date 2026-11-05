import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { localHourInTimezone, todayInTimezone } from "@/lib/calendar/dates";
import { withTransaction } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

async function runMidnight(request: NextRequest): Promise<NextResponse> {
  try {
    const secret = getEnv().CRON_SECRET;
    const auth = request.headers.get("authorization");
    const cronHeader = request.headers.get("x-vercel-cron");
    if (secret && auth !== `Bearer ${secret}` && !cronHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const forceAll = request.nextUrl.searchParams.get("all") === "1";
    const now = new Date();
    const cronBatchId = randomUUID();

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

    logger.info("Midnight cron start", {
      cronBatchId,
      tenantCount: tenants.length,
      dueCount: dueTenantIds.size,
      timezoneCount: byTimezone.size,
      forceAll,
    });

    const results: Array<{ tenantId: string; ok: boolean; skipped?: boolean; runId?: string }> =
      [];

    for (const tenant of tenants) {
      if (!dueTenantIds.has(tenant.id)) {
        results.push({ tenantId: tenant.id, ok: true, skipped: true });
        continue;
      }

      try {
        const summary = await withTransaction(
          { tenantId: tenant.id, userId: SYSTEM_USER_ID },
          async (client) => {
            await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
            return runEvaluationPipeline(client, {
              tenantId: tenant.id,
              userId: SYSTEM_USER_ID,
              trigger: "midnight",
              asOfDate: todayInTimezone(tenant.timezone, now),
              cronBatchId,
            });
          },
        );
        results.push({ tenantId: tenant.id, ok: true, runId: summary.runId });
      } catch (error: unknown) {
        logger.error("Midnight failed for tenant", {
          cronBatchId,
          tenantId: tenant.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        results.push({ tenantId: tenant.id, ok: false });
      }
    }

    return NextResponse.json({
      ok: true,
      cronBatchId,
      ran: dueTenantIds.size,
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
