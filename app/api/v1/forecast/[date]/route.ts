import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { forecastService } from "@/lib/services";
import { forecastDateParamSchema } from "@/types/forecast/forecast.types";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ date: string }> },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = forecastDateParamSchema.safeParse(await context.params);
    if (!params.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const day = await forecastService.getDay(session.tenantId, session.userId, params.data.date);
    if (!day) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(day);
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    logger.error("GET /forecast/[date] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
