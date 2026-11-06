import { NextResponse } from "next/server";
import { listActiveTenants, resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Every active household, so the You screen can offer a switcher.
    const tenants = await listActiveTenants(session.userId);
    return NextResponse.json({
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      email: session.email,
      name: session.name,
      tenantName: session.tenantName,
      tenantType: session.tenantType,
      timezone: session.timezone,
      tenants,
      canSpend: session.role === "owner" || session.role === "admin" || session.role === "member",
    });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    logger.error("GET /me failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
