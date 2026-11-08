import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { normalizeLocale } from "@/i18n/config";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { withTransaction } from "@/lib/db/connection";
import type { MembershipRole } from "@/lib/auth/permissions";
import { pickTenantForSession, type RequestIdentity } from "@/lib/auth/tenant-pick";
import { TenantSelectionRequiredError } from "@/lib/auth/tenant-selection";
import type { AppLocale } from "@/types/i18n/locale.types";
import type { TenantChoice } from "@/types/me/me.types";
import type { TenantType } from "@/types/tenant/tenant.types";

export type { MembershipRole } from "@/lib/auth/permissions";
export {
  assertMembership,
  canConfigure,
  canManagePeople,
  canSpend,
} from "@/lib/auth/permissions";

/** httpOnly cookie that holds the household a multi-household user picked. */
export const TENANT_COOKIE = "orbit_tenant";

export interface AppSession {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  email: string;
  name: string;
  tenantName: string;
  tenantType: TenantType;
  /** IANA zone that owns the household's calendar (D10). */
  timezone: string;
  /** Per-person UI language. */
  preferredLocale: AppLocale;
}

async function loadMembership(userId: string, tenantId: string): Promise<AppSession | null> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const result = await client.query<{
      role: MembershipRole;
      email: string;
      name: string;
      tenant_name: string;
      tenant_type: TenantType;
      timezone: string;
      preferred_locale: string;
      status: string;
    }>(
      `SELECT m.role, m.status, u.email, u.name, u.preferred_locale, t.name AS tenant_name,
              t.tenant_type, t.timezone
       FROM tenant_memberships m
       JOIN users u ON u.id = m.user_id
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1 AND m.tenant_id = $2`,
      [userId, tenantId],
    );

    const row = result.rows[0];
    if (!row || row.status !== "active") {
      return null;
    }

    return {
      userId,
      tenantId,
      role: row.role,
      email: row.email,
      name: row.name,
      tenantName: row.tenant_name,
      tenantType: row.tenant_type,
      timezone: row.timezone,
      preferredLocale: normalizeLocale(row.preferred_locale),
    };
  });
}

/** Who is calling, without checking membership. Cookie session wins over dev headers. */
export async function resolveIdentity(): Promise<RequestIdentity | null> {
  const nextAuth = await auth();
  if (nextAuth?.userId) {
    // Cookie session wins. Do not let request headers impersonate another user.
    const picked = (await cookies()).get(TENANT_COOKIE)?.value;
    return pickTenantForSession({
      userId: nextAuth.userId,
      sessionTenantId: nextAuth.tenantId,
      cookieTenantId: picked,
    });
  }

  if (!isDevHeaderAuthEnabled()) {
    return null;
  }

  const h = await headers();
  const headerUserId = h.get("x-user-id");
  if (!headerUserId) {
    return null;
  }
  // x-tenant-id counts as an explicit tenant choice.
  return { userId: headerUserId, tenantId: h.get("x-tenant-id") || null };
}

export async function listActiveTenants(userId: string): Promise<TenantChoice[]> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const result = await client.query<{ tenant_id: string; tenant_name: string }>(
      `SELECT m.tenant_id, t.name AS tenant_name
       FROM tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1 AND m.status = 'active'
       ORDER BY t.name ASC`,
      [userId],
    );
    return result.rows.map((r) => ({ tenantId: r.tenant_id, tenantName: r.tenant_name }));
  });
}

/**
 * Resolve the caller and their tenant.
 * Throws TenantSelectionRequiredError when the user has more than one active
 * membership and the request names no tenant. It never picks one silently.
 */
export async function resolveSession(): Promise<AppSession | null> {
  const identity = await resolveIdentity();
  if (!identity) {
    return null;
  }

  if (identity.tenantId) {
    const chosen = await loadMembership(identity.userId, identity.tenantId);
    if (chosen) return chosen;
    // Stale cookie/JWT pin: membership gone. Fall back to remaining households.
    if (identity.fallbackTenantId) {
      const fallback = await loadMembership(identity.userId, identity.fallbackTenantId);
      if (fallback) return fallback;
    }
  }

  const tenants = await listActiveTenants(identity.userId);
  if (tenants.length === 0) {
    return null;
  }
  if (tenants.length > 1) {
    // Never silently pick; never bounce a signed-in multi-member user to /signin.
    throw new TenantSelectionRequiredError(tenants);
  }
  return loadMembership(identity.userId, tenants[0].tenantId);
}
