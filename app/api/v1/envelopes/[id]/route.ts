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
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  amountEachPaydayCents: z.number().int().positive().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await context.params;
    const json: unknown = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await planService.updateEnvelope({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      envelopeId: id,
      payload: parsed.data,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logger.error("PATCH /envelopes failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
