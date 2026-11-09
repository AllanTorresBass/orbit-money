import { NextResponse } from "next/server";
import { listActiveTenants, resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError, tenantSelectionResponse } from "@/lib/auth/tenant-selection";
import { withTransaction } from "@/lib/db/connection";
import { logger } from "@/lib/logger";
import { updateLocaleBodySchema } from "@/types/i18n/locale.types";
import { updateNameBodySchema, type MeDto } from "@/types/me/me.types";

function toMeDto(
  session: NonNullable<Awaited<ReturnType<typeof resolveSession>>>,
  tenants: MeDto["tenants"],
): MeDto {
  return {
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    email: session.email,
    name: session.name,
    tenantName: session.tenantName,
    tenantType: session.tenantType,
    timezone: session.timezone,
    preferredLocale: session.preferredLocale,
    tenants,
    canSpend: session.role === "owner" || session.role === "admin" || session.role === "member",
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Every active household, so the You screen can offer a switcher.
    const tenants = await listActiveTenants(session.userId);
    return NextResponse.json(toMeDto(session, tenants));
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    logger.error("GET /me failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function currentMeResponse(): Promise<NextResponse> {
  const refreshed = await resolveSession();
  if (!refreshed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tenants = await listActiveTenants(refreshed.userId);
  return NextResponse.json(toMeDto(refreshed, tenants));
}

/** Update the caller's language or their own display name. One field per request. */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const session = await resolveSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json: unknown = await request.json().catch(() => null);
    const hasName = isJsonRecord(json) && Object.prototype.hasOwnProperty.call(json, "name");
    const hasLocale =
      isJsonRecord(json) && Object.prototype.hasOwnProperty.call(json, "preferredLocale");
    if (hasName && hasLocale) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (hasName) {
      const parsed = updateNameBodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }

      let updated = false;
      await withTransaction(null, async (client) => {
        await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
        const result = await client.query(`UPDATE users SET name = $1 WHERE id = $2`, [
          parsed.data.name,
          session.userId,
        ]);
        updated = result.rowCount === 1;
      });
      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return currentMeResponse();
    }

    const parsed = updateLocaleBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }

    await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      await client.query(`UPDATE users SET preferred_locale = $1 WHERE id = $2`, [
        parsed.data.preferredLocale,
        session.userId,
      ]);
    });

    return currentMeResponse();
  } catch (error: unknown) {
    if (error instanceof TenantSelectionRequiredError) {
      return tenantSelectionResponse(error);
    }
    logger.error("PATCH /me failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
