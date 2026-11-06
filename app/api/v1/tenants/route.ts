import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { logger } from "@/lib/logger";
import { tenantService } from "@/lib/services";
import { createTenantBodySchema } from "@/types/tenant/tenant.types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const nextAuth = await auth();
    const sessionEmail = nextAuth?.user?.email?.trim().toLowerCase() ?? null;
    const sessionUserId = nextAuth?.userId || null;

    // Production: Create requires a signed-in email. Local Harbor may bootstrap without.
    if (!sessionEmail || !sessionUserId) {
      if (!isDevHeaderAuthEnabled()) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const json: unknown = await request.json();
    const parsed = createTenantBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    if (sessionEmail) {
      const ownerEmail = parsed.data.ownerEmail.trim().toLowerCase();
      if (ownerEmail !== sessionEmail) {
        return NextResponse.json(
          { error: "ownerEmail must match the signed-in email" },
          { status: 403 },
        );
      }
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
