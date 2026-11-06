import { NextRequest, NextResponse } from "next/server";
import { handleLedgerPost } from "@/lib/api/ledger-route";
import { transactionService } from "@/lib/services";
import { recordInflowBodySchema } from "@/types/transactions/transaction.types";

/** Record money in (a payday). Owner and admin only. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleLedgerPost(request, {
    label: "POST /transactions/inflow",
    schema: recordInflowBodySchema,
    run: (session, body) =>
      transactionService.recordInflow({
        ...body,
        tenantId: session.tenantId,
        userId: session.userId,
        role: session.role,
      }),
  });
}
