import { NextRequest, NextResponse } from "next/server";
import { handleLedgerPost } from "@/lib/api/ledger-route";
import { transactionService } from "@/lib/services";
import { createPurchaseBodySchema } from "@/types/transactions/transaction.types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleLedgerPost(request, {
    label: "POST /transactions",
    schema: createPurchaseBodySchema,
    run: (session, body) =>
      transactionService.createPurchase({
        tenantId: session.tenantId,
        userId: session.userId,
        role: session.role,
        amountCents: body.amountCents,
        idempotencyKey: body.idempotencyKey,
        memo: body.memo,
      }),
  });
}
