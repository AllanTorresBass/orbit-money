import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { serviceErrorResponse } from "@/lib/api/service-error-response";
import { isServiceError } from "@/lib/errors/service-errors";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";
import { envelopePayloadSchema, entityIdParamSchema } from "@/types/plan/plan.types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const json: unknown = await request.json();
    const parsed = envelopePayloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await planService.updateEnvelope({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      envelopeId: id,
      payload: parsed.data,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    if (isServiceError(error)) {
      return serviceErrorResponse(error, "PATCH /envelopes");
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logger.error("PATCH /envelopes failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Take a bill or goal off the Plan. Owner and admin only. */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = entityIdParamSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await planService.removeEnvelope({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      envelopeId: parsed.data.id,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    if (isServiceError(error)) {
      return serviceErrorResponse(error, "DELETE /envelopes");
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("DELETE /envelopes failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
