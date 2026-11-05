import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { peopleService } from "@/lib/services";
import type { PendingInvitesResponse } from "@/types/people/people.types";

/**
 * Invites waiting for the signed-in person. Needs a signed-in user, not an active
 * household, so someone with only invited memberships can still see where they were asked.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const identity = await resolveIdentity();
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const invites = await peopleService.listPendingInvites(identity.userId);
    const body: PendingInvitesResponse = { invites };
    return NextResponse.json(body);
  } catch (error: unknown) {
    logger.error("GET /me/invites failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
