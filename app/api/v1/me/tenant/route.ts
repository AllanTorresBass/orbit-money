import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity, TENANT_COOKIE } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db/connection";
import { logger } from "@/lib/logger";
import { selectTenantBodySchema } from "@/types/me/me.types";

/** Remember which household a multi-household person is using. Requires an active membership. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const identity = await resolveIdentity();
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const json: unknown = await request.json();
    const parsed = selectTenantBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }

    const member = await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const result = await client.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM tenant_memberships
         WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'`,
        [identity.userId, parsed.data.tenantId],
      );
      return result.rows.length > 0;
    });
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    (await cookies()).set(TENANT_COOKIE, parsed.data.tenantId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ tenantId: parsed.data.tenantId });
  } catch (error: unknown) {
    logger.error("POST /me/tenant failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
