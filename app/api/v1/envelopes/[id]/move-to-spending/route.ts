import { NextRequest, NextResponse } from "next/server";
import { serviceErrorResponse } from "@/lib/api/service-error-response";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { isServiceError } from "@/lib/errors/service-errors";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";
import { entityIdParamSchema } from "@/types/plan/plan.types";

const LABEL = "POST /envelopes/[id]/move-to-spending";

/** Move a goal's (or an off-payday bill's) leftover money into Spending. Owner and admin only. */
export async function POST(
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
    const result = await planService.moveEnvelopeToSpending({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      envelopeId: parsed.data.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    if (isServiceError(error)) {
      return serviceErrorResponse(error, LABEL);
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      logger.info(`${LABEL} rejected`, { status: 403, reason: "forbidden" });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error(`${LABEL} failed`, { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
