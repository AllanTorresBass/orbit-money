import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { resolveSession, type AppSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { isServiceError } from "@/lib/errors/service-errors";
import { logger } from "@/lib/logger";
import type { TransactionResult } from "@/types/transactions/transaction.types";

/**
 * Shared shape of the three ledger POST routes: authenticate, validate the body with Zod,
 * run the service call, and map its errors to statuses. The service decides who may write.
 */
export async function handleLedgerPost<TBody>(
  request: NextRequest,
  options: {
    label: string;
    schema: ZodType<TBody>;
    run: (session: AppSession, body: TBody) => Promise<TransactionResult>;
  },
): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const parsed = options.schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await options.run(session, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    if (isServiceError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Amount must be positive") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logger.error(`${options.label} failed`, { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
