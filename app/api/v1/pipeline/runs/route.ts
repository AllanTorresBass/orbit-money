import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { pipelineService } from "@/lib/services";
import { pipelineRunsQuerySchema } from "@/types/pipeline/pipeline.types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = pipelineRunsQuerySchema.safeParse({
      asOfDate: request.nextUrl.searchParams.get("asOfDate") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      includeSteps: request.nextUrl.searchParams.get("includeSteps") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    const runs = await pipelineService.listRuns({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      asOfDate: parsed.data.asOfDate,
      limit: parsed.data.limit,
      includeSteps: parsed.data.includeSteps,
    });
    return NextResponse.json({ runs });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("GET /pipeline/runs failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
