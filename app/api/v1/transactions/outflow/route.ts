import { NextRequest, NextResponse } from "next/server";
import { handleLedgerPost } from "@/lib/api/ledger-route";
import { transactionService } from "@/lib/services";
import { recordOutflowBodySchema } from "@/types/transactions/transaction.types";

/** Record a bill paid from the bank. Owner and admin only. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleLedgerPost(request, {
    label: "POST /transactions/outflow",
    schema: recordOutflowBodySchema,
    run: (session, body) =>
      transactionService.recordOutflow({
        ...body,
        tenantId: session.tenantId,
        userId: session.userId,
        role: session.role,
      }),
  });
}
