import { headers } from "next/headers";
import { auth } from "@/auth";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { withTransaction } from "@/lib/db/connection";
import type { MembershipRole } from "@/lib/auth/permissions";

export type { MembershipRole } from "@/lib/auth/permissions";
export {
  assertMembership,
  canConfigure,
  canManagePeople,
  canSpend,
} from "@/lib/auth/permissions";

export interface AppSession {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  email: string;
  name: string;
  tenantName: string;
}

async function loadMembership(userId: string, tenantId: string): Promise<AppSession | null> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const result = await client.query<{
      role: MembershipRole;
      email: string;
      name: string;
      tenant_name: string;
      status: string;
    }>(
      `SELECT m.role, m.status, u.email, u.name, t.name AS tenant_name
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
    };
  });
}

export async function resolveSession(): Promise<AppSession | null> {
  const nextAuth = await auth();
  if (nextAuth?.userId && nextAuth.tenantId) {
    // Cookie session wins. Do not let request headers impersonate another user.
    return loadMembership(nextAuth.userId, nextAuth.tenantId);
  }

  if (!isDevHeaderAuthEnabled()) {
    return null;
  }

  const h = await headers();
  const headerUserId = h.get("x-user-id");
  const headerTenantId = h.get("x-tenant-id");
  if (headerUserId && headerTenantId) {
    return loadMembership(headerUserId, headerTenantId);
  }

  return null;
}
