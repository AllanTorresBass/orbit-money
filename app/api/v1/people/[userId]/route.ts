import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { peopleService } from "@/lib/services";
import { personParamSchema, updateRoleBodySchema } from "@/types/people/people.types";

type RouteContext = { params: Promise<{ userId: string }> };

function errorResponse(label: string, error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "unknown";
  if (message === "Forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (message === "Not found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  logger.error(`${label} failed`, { error: message });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = personParamSchema.safeParse(await context.params);
    const json: unknown = await request.json();
    const body = updateRoleBodySchema.safeParse(json);
    if (!params.success || !body.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await peopleService.updateRole({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      targetUserId: params.data.userId,
      newRole: body.data.role,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    return errorResponse("PATCH /people/[userId]", error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = personParamSchema.safeParse(await context.params);
    if (!params.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await peopleService.removeMember({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      targetUserId: params.data.userId,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    return errorResponse("DELETE /people/[userId]", error);
  }
}
