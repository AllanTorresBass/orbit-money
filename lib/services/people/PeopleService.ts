import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canManagePeople, type MembershipRole } from "@/lib/auth/permissions";
import { withTransaction } from "@/lib/db/connection";
import { BaseService } from "@/lib/services/base/BaseService";
import type {
  AssignableRole,
  InviteResult,
  MembershipStatus,
  PersonDto,
} from "@/types/people/people.types";

interface TargetMembership {
  role: MembershipRole;
  status: MembershipStatus;
}

export class PeopleService extends BaseService {
  constructor() {
    super("PeopleService");
  }

  async list(tenantId: string, userId: string): Promise<PersonDto[]> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const result = await client.query<{
        user_id: string;
        name: string;
        email: string;
        role: PersonDto["role"];
        status: MembershipStatus;
      }>(
        `SELECT m.user_id, u.name, u.email, m.role, m.status
         FROM tenant_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.tenant_id = $1
         ORDER BY m.role, u.name`,
        [tenantId],
      );
      return result.rows.map((r) => ({
        userId: r.user_id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
      }));
    });
  }

  /** Leaves the membership `invited`. The person turns it `active` with `acceptInvite`. */
  async invite(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    email: string;
    name: string;
    inviteRole: AssignableRole;
  }): Promise<InviteResult> {
    if (!canManagePeople(input.role)) {
      throw new Error("Forbidden");
    }
    if (input.role === "admin" && input.inviteRole === "admin") {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");

      let inviteeId: string;
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`,
        [input.email.toLowerCase()],
      );
      if (existing.rows[0]) {
        inviteeId = existing.rows[0].id;
      } else {
        inviteeId = randomUUID();
        await client.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`, [
          inviteeId,
          input.email.toLowerCase(),
          input.name,
        ]);
      }

      // An active member (including the owner) is never knocked back to invited.
      const upserted = await client.query<{ status: MembershipStatus }>(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
         VALUES ($1, $2, $3, 'invited')
         ON CONFLICT (tenant_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'invited'
           WHERE tenant_memberships.status <> 'active'
         RETURNING status`,
        [input.tenantId, inviteeId, input.inviteRole],
      );
      if (!upserted.rows[0]) {
        throw new Error("Conflict");
      }

      this.logInfo("Person invited", { tenantId: input.tenantId, userId: inviteeId });
      return { userId: inviteeId, status: upserted.rows[0].status };
    });
  }

  /** The invited person confirms their own membership. */
  async acceptInvite(input: { tenantId: string; userId: string }): Promise<InviteResult> {
    return withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const updated = await client.query<{ status: MembershipStatus }>(
        `UPDATE tenant_memberships
         SET status = 'active'
         WHERE tenant_id = $1 AND user_id = $2 AND status = 'invited'
         RETURNING status`,
        [input.tenantId, input.userId],
      );
      if (!updated.rows[0]) {
        throw new Error("Not found");
      }
      this.logInfo("Invite accepted", { tenantId: input.tenantId, userId: input.userId });
      return { userId: input.userId, status: updated.rows[0].status };
    });
  }

  async updateRole(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    targetUserId: string;
    newRole: AssignableRole;
  }): Promise<InviteResult> {
    this.assertCanChange(input);
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const target = await this.loadTarget(client, input.tenantId, input.targetUserId);
      if (target.role === "owner" || (input.role === "admin" && target.role === "admin")) {
        throw new Error("Forbidden");
      }
      if (input.role === "admin" && input.newRole === "admin") {
        throw new Error("Forbidden");
      }

      const updated = await client.query<{ status: MembershipStatus }>(
        `UPDATE tenant_memberships SET role = $1
         WHERE tenant_id = $2 AND user_id = $3
         RETURNING status`,
        [input.newRole, input.tenantId, input.targetUserId],
      );
      this.logInfo("Role updated", { tenantId: input.tenantId, userId: input.targetUserId });
      return { userId: input.targetUserId, status: updated.rows[0].status };
    });
  }

  /** Soft removal. The row stays so ledger history keeps its author. */
  async removeMember(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    targetUserId: string;
  }): Promise<InviteResult> {
    this.assertCanChange(input);
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const target = await this.loadTarget(client, input.tenantId, input.targetUserId);
      if (target.role === "owner" || (input.role === "admin" && target.role === "admin")) {
        throw new Error("Forbidden");
      }

      const updated = await client.query<{ status: MembershipStatus }>(
        `UPDATE tenant_memberships SET status = 'suspended'
         WHERE tenant_id = $1 AND user_id = $2
         RETURNING status`,
        [input.tenantId, input.targetUserId],
      );
      this.logInfo("Member removed", { tenantId: input.tenantId, userId: input.targetUserId });
      return { userId: input.targetUserId, status: updated.rows[0].status };
    });
  }

  private assertCanChange(input: {
    userId: string;
    role: MembershipRole;
    targetUserId: string;
  }): void {
    if (!canManagePeople(input.role)) {
      throw new Error("Forbidden");
    }
    if (input.userId === input.targetUserId) {
      throw new Error("Forbidden");
    }
  }

  private async loadTarget(
    client: PoolClient,
    tenantId: string,
    targetUserId: string,
  ): Promise<TargetMembership> {
    const result = await client.query<TargetMembership>(
      `SELECT role, status FROM tenant_memberships
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, targetUserId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Not found");
    }
    return row;
  }
}

export const peopleService = new PeopleService();
