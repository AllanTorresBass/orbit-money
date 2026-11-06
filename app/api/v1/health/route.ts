import { NextResponse } from "next/server";
import { loadHealth } from "@/lib/db/health";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * `{ ok, db, migrations: { applied, expected }, cronBatchAgeSec }`. Public and read-only:
 * counts and an age, nothing about any household. 503 when the database is down or a
 * shipped migration has not been applied.
 */
export async function GET(): Promise<NextResponse> {
  try {
    getEnv();
    const health = await loadHealth();
    return NextResponse.json(health, { status: health.ok ? 200 : 503 });
  } catch (error: unknown) {
    logger.error("Health check failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ ok: false, error: "Health check failed" }, { status: 503 });
  }
}
