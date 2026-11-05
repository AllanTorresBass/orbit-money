import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { tenantService } from "@/lib/services";
import { createTenantBodySchema } from "@/types/tenant/tenant.types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const json: unknown = await request.json();
    const parsed = createTenantBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const created = await tenantService.createHousehold(parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    logger.error("POST /tenants failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
