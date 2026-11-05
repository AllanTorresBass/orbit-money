import { headers } from "next/headers";
import type { PoolClient } from "pg";
import { withTransaction } from "@/lib/db/connection";

export type MembershipRole = "owner" | "admin" | "member" | "read_only" | "advisor";

export interface AppSession {
  userId: string;
  tenantId: string;
  role: MembershipRole;
  email: string;
  name: string;
  tenantName: string;
}

export async function resolveSession(): Promise<AppSession | null> {
  const h = await headers();
  const userId = h.get("x-user-id");
  const tenantId = h.get("x-tenant-id");
  if (!userId || !tenantId) {
    return null;
  }

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

export function canSpend(role: MembershipRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function canConfigure(role: MembershipRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManagePeople(role: MembershipRole): boolean {
  return role === "owner" || role === "admin";
}

export async function assertMembership(
  client: PoolClient,
  userId: string,
  tenantId: string,
): Promise<MembershipRole> {
  const result = await client.query<{ role: MembershipRole; status: string }>(
    `SELECT role, status FROM tenant_memberships
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  const row = result.rows[0];
  if (!row || row.status !== "active") {
    throw new Error("Forbidden");
  }
  return row.role;
}
