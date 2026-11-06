import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { isServiceError } from "@/lib/errors/service-errors";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";
import { entityIdParamSchema, updateScheduleBodySchema } from "@/types/plan/plan.types";

/** Change a payday or bill schedule. Owner and admin only. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = entityIdParamSchema.safeParse(await context.params);
    if (!params.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const body = updateScheduleBodySchema.safeParse(json);
    if (!body.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await planService.updateSchedule({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      scheduleId: params.data.id,
      changes: body.data,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("PATCH /schedules failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
