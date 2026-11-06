import { NextRequest, NextResponse } from "next/server";
import { ledgerErrorResponse } from "@/lib/api/ledger-route";
import { resolveSession } from "@/lib/auth/session";
import { transactionService } from "@/lib/services";
import { transactionIdParamSchema } from "@/types/transactions/transaction.types";

const LABEL = "POST /transactions/[id]/void";

/** Undo a purchase or a bill payment. Owner and admin only. One undo per row. */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = transactionIdParamSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const result = await transactionService.voidTransaction({
      tenantId: session.tenantId,
      userId: session.userId,
      role: session.role,
      transactionId: parsed.data.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    return ledgerErrorResponse(error, LABEL);
  }
}
