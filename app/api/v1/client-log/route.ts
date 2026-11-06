import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { logger } from "@/lib/logger";
import {
  CLIENT_LOG_LIMIT,
  CLIENT_LOG_WINDOW_SECONDS,
  clientLogRateLimitKey,
} from "@/lib/observability/client-log";
import { clientLogBodySchema } from "@/types/observability/client-log.types";

const LABEL = "POST /client-log";

/**
 * Let a signed-in browser put one line in the server log (a failed save, a dismissed queue).
 * Rate limited per person on the shared `auth_rate_limits` table. Fails closed on limiter errors.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    const parsed = clientLogBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const limit = await consumeRateLimit({
      key: clientLogRateLimitKey(session.userId),
      limit: CLIENT_LOG_LIMIT,
      windowSeconds: CLIENT_LOG_WINDOW_SECONDS,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reports" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const meta = {
      source: "client",
      tenantId: session.tenantId,
      userId: session.userId,
      route: parsed.data.route ?? null,
      clientMessage: parsed.data.message,
    };
    if (parsed.data.level === "warn") {
      logger.warn("Client report", meta);
    } else {
      logger.info("Client report", meta);
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    logger.error(`${LABEL} failed`, { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
