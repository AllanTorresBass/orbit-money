import { NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const proposals = await planService.listProposals(
      session.tenantId,
      session.userId,
      session.role,
    );
    return NextResponse.json({ proposals });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("GET /proposals failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
