import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { withTransaction } from "@/lib/db/connection";
import type { MembershipRole } from "@/lib/auth/permissions";
import { TenantSelectionRequiredError } from "@/lib/auth/tenant-selection";
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
      status: string;
    }>(
      `SELECT m.role, m.status, u.email, u.name, t.name AS tenant_name, t.tenant_type
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
    };
  });
}

interface RequestIdentity {
  userId: string;
  /** Explicit tenant from the signed-in session or the dev header. Null when none was named. */
  tenantId: string | null;
}

/** Who is calling, without checking membership. Cookie session wins over dev headers. */
export async function resolveIdentity(): Promise<RequestIdentity | null> {
  const nextAuth = await auth();
  if (nextAuth?.userId) {
    // Cookie session wins. Do not let request headers impersonate another user.
    const picked = (await cookies()).get(TENANT_COOKIE)?.value;
    return { userId: nextAuth.userId, tenantId: nextAuth.tenantId || picked || null };
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

async function listActiveTenants(userId: string): Promise<TenantChoice[]> {
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
    return loadMembership(identity.userId, identity.tenantId);
  }

  const tenants = await listActiveTenants(identity.userId);
  if (tenants.length === 0) {
    return null;
  }
  if (tenants.length > 1) {
    throw new TenantSelectionRequiredError(tenants);
  }
  return loadMembership(identity.userId, tenants[0].tenantId);
}
