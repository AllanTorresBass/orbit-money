import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import { transactionService } from "@/lib/services";

const bodySchema = z.object({
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(1).optional(),
  memo: z.string().max(200).optional(),
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

    const result = await transactionService.createPurchase({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      amountCents: parsed.data.amountCents,
      idempotencyKey: parsed.data.idempotencyKey,
      memo: parsed.data.memo,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logger.error("POST /transactions failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
