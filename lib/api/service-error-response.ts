import { NextResponse } from "next/server";
import type { ServiceError } from "@/lib/errors/service-errors";
import { logger } from "@/lib/logger";

/**
 * Map a deliberate service rejection to its status. A 4xx is the system working as designed,
 * so it is logged at info (never error), without the person or any amounts.
 */
export function serviceErrorResponse(error: ServiceError, label: string): NextResponse {
  logger.info(`${label} rejected`, { status: error.status, reason: error.message });
  return NextResponse.json({ error: error.message }, { status: error.status });
}
