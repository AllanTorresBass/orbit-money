import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";
import { reorderEnvelopesBodySchema } from "@/types/plan/plan.types";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json: unknown = await request.json();
    const parsed = reorderEnvelopesBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    await planService.reorderEnvelopes({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      tierCategory: parsed.data.tierCategory,
      orderedIds: parsed.data.orderedIds,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Validation failed") {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    logger.error("PATCH /envelopes/reorder failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
