import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db/connection";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function GET(): Promise<NextResponse> {
  try {
    getEnv();
    const ok = await checkDatabase();
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Database check failed" }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    logger.error("Health check failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "Health check failed" },
      { status: 503 },
    );
  }
}
