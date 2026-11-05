import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const data = await planService.getPlan(session.tenantId, session.userId);
    return NextResponse.json(data);
  } catch (error: unknown) {
    logger.error("GET /plan failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
