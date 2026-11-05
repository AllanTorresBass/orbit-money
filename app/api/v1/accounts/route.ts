import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { accountService } from "@/lib/services";
import { createAccountBodySchema } from "@/types/account/account.types";

export async function GET(): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const accounts = await accountService.list(session.tenantId, session.userId);
    return NextResponse.json({ accounts });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    logger.error("GET /accounts failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json: unknown = await request.json();
    const parsed = createAccountBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const account = await accountService.create({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      name: parsed.data.name,
      balanceCents: parsed.data.balanceCents,
    });
    return NextResponse.json(account, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("POST /accounts failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
