import type { PoolClient } from "pg";

export type MembershipRole = "owner" | "admin" | "member" | "read_only" | "advisor";

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
