import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { resolveSession, type AppSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { serviceErrorResponse } from "@/lib/api/service-error-response";
import { isServiceError } from "@/lib/errors/service-errors";
import { logger } from "@/lib/logger";
import type { TransactionResult } from "@/types/transactions/transaction.types";

/** Map what a ledger service call threw to a response. Shared by every ledger route. */
export function ledgerErrorResponse(error: unknown, label: string): NextResponse {
  if (error instanceof TenantSelectionRequiredError) {
    return tenantSelectionResponse(error);
  }
  if (isServiceError(error)) {
    return serviceErrorResponse(error, label);
  }
  const message = error instanceof Error ? error.message : "unknown";
  if (message === "Forbidden") {
    logger.info(`${label} rejected`, { status: 403, reason: "forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (message === "Amount must be positive") {
    logger.info(`${label} rejected`, { status: 400, reason: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
  logger.error(`${label} failed`, { error: message });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

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
    return ledgerErrorResponse(error, options.label);
  }
}
