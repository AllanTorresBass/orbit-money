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

    const tenants = await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const result = await client.query<{ id: string; timezone: string }>(
        `SELECT id, timezone FROM tenants`,
      );
      return result.rows;
    });

    const due = tenants.filter(
      (tenant) => forceAll || localHourInTimezone(tenant.timezone, now) === 0,
    );

    logger.info("Midnight cron start", {
      tenantCount: tenants.length,
      dueCount: due.length,
      forceAll,
    });

    const results: Array<{ tenantId: string; ok: boolean; skipped?: boolean }> = [];

    for (const tenant of tenants) {
      if (!forceAll && localHourInTimezone(tenant.timezone, now) !== 0) {
        results.push({ tenantId: tenant.id, ok: true, skipped: true });
        continue;
      }

      try {
        await withTransaction(
          { tenantId: tenant.id, userId: SYSTEM_USER_ID },
          async (client) => {
            await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
            await runEvaluationPipeline(client, {
              tenantId: tenant.id,
              userId: SYSTEM_USER_ID,
              trigger: "midnight",
              asOfDate: todayInTimezone(tenant.timezone, now),
            });
          },
        );
        results.push({ tenantId: tenant.id, ok: true });
      } catch (error: unknown) {
        logger.error("Midnight failed for tenant", {
          tenantId: tenant.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        results.push({ tenantId: tenant.id, ok: false });
      }
    }

    return NextResponse.json({
      ok: true,
      ran: due.length,
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
