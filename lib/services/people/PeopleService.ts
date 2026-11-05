import { randomUUID } from "node:crypto";
import { canManagePeople, type MembershipRole } from "@/lib/auth/permissions";
import { withTransaction } from "@/lib/db/connection";
import { BaseService } from "@/lib/services/base/BaseService";

export class PeopleService extends BaseService {
  constructor() {
    super("PeopleService");
  }

  async invite(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    email: string;
    name: string;
    inviteRole: Exclude<MembershipRole, "owner">;
  }): Promise<{ userId: string; status: string }> {
    if (!canManagePeople(input.role)) {
      throw new Error("Forbidden");
    }
    return withTransaction({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");

      let userId: string;
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`,
        [input.email.toLowerCase()],
      );
      if (existing.rows[0]) {
        userId = existing.rows[0].id;
      } else {
        userId = randomUUID();
        await client.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`, [
          userId,
          input.email.toLowerCase(),
          input.name,
        ]);
      }

      await client.query(
        `INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
         VALUES ($1, $2, $3, 'invited')
         ON CONFLICT (tenant_id, user_id) DO UPDATE
           SET role = EXCLUDED.role, status = 'invited'`,
        [input.tenantId, userId, input.inviteRole],
      );

      // Demo path: auto-accept invite so the actor switcher can use them immediately.
      await client.query(
        `UPDATE tenant_memberships SET status = 'active'
         WHERE tenant_id = $1 AND user_id = $2`,
        [input.tenantId, userId],
      );

      this.logInfo("Person invited", { tenantId: input.tenantId, userId });
      return { userId, status: "active" };
    });
  }
}

export const peopleService = new PeopleService();
