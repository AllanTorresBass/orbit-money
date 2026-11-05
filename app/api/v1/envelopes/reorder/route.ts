import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";

const bodySchema = z.object({
  tierCategory: z.enum(["fixed", "sinking"]),
  orderedIds: z.array(z.string().uuid()).min(1),
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

    await planService.reorderEnvelopes({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      tierCategory: parsed.data.tierCategory,
      orderedIds: parsed.data.orderedIds,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Validation failed") {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    logger.error("PATCH /envelopes/reorder failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
