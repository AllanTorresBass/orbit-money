import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      email: session.email,
      name: session.name,
      tenantName: session.tenantName,
      canSpend: session.role === "owner" || session.role === "admin" || session.role === "member",
    });
  } catch (error: unknown) {
    logger.error("GET /me failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
