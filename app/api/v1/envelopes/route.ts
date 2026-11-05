import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { planService } from "@/lib/services";

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  tierCategory: z.enum(["fixed", "sinking"]),
  targetCapCents: z.number().int().nonnegative().nullable(),
  monthlyInstallmentCents: z.number().int().nonnegative().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amountEachPaydayCents: z.number().int().positive().nullable().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
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

    const result = await planService.createEnvelope({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      payload: parsed.data,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("POST /envelopes failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
