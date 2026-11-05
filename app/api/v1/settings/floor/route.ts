import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { tenantService } from "@/lib/services";

const bodySchema = z.object({
  floorCents: z.number().int().min(0),
});

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const result = await tenantService.updateFloor(
      session.tenantId,
      session.userId,
      session.role,
      parsed.data.floorCents,
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("PATCH /settings/floor failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
