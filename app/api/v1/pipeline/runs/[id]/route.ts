import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { pipelineService } from "@/lib/services";
import { pipelineRunIdParamSchema } from "@/types/pipeline/pipeline.types";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = pipelineRunIdParamSchema.safeParse(await context.params);
    if (!params.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const run = await pipelineService.getRun({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      runId: params.data.id,
    });
    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ run });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("GET /pipeline/runs/[id] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
