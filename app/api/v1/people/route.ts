import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { tenantService } from "@/lib/services";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const people = await tenantService.listPeople(session.tenantId, session.userId);
    return NextResponse.json({ people });
  } catch (error: unknown) {
    logger.error("GET /people failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
