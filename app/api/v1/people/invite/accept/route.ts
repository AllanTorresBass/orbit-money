import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { peopleService } from "@/lib/services";
import { acceptInviteBodySchema } from "@/types/people/people.types";

/** The invited person accepts their own invite. They are not active yet, so no membership check. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const identity = await resolveIdentity();
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json: unknown = await request.json().catch(() => ({}));
    const parsed = acceptInviteBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const tenantId = parsed.data.tenantId ?? identity.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const result = await peopleService.acceptInvite({ tenantId, userId: identity.userId });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    logger.error("POST /people/invite/accept failed", { error: message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
