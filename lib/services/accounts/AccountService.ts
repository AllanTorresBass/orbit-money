import { canConfigure, type MembershipRole } from "@/lib/auth/permissions";
import { withTransaction } from "@/lib/db/connection";
import { fromCents, toCents } from "@/lib/money/numeric";
import { runEvaluationPipeline } from "@/lib/pipeline/run-evaluation";
import { BaseService } from "@/lib/services/base/BaseService";

export interface AccountDto {
  id: string;
  name: string;
  balanceCents: number;
  isEveryday: boolean;
}

export class AccountService extends BaseService {
  constructor() {
    super("AccountService");
  }

  async list(tenantId: string, userId: string): Promise<AccountDto[]> {
    return withTransaction({ tenantId, userId }, async (client) => {
      const result = await client.query<{
        id: string;
        name: string;
        current_balance: string;
        is_everyday: boolean;
      }>(
        `SELECT id, name, current_balance::text, is_everyday
         FROM accounts WHERE tenant_id = $1 ORDER BY is_everyday DESC, name ASC`,
        [tenantId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        balanceCents: toCents(row.current_balance),
        isEveryday: row.is_everyday,
      }));
    });
  }

  async updateBalance(input: {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    accountId: string;
    balanceCents: number;
  }): Promise<AccountDto> {
    if (!canConfigure(input.role)) {
      throw new Error("Forbidden");
    }
    return withTransaction(
      { tenantId: input.tenantId, userId: input.userId },
      async (client) => {
        const result = await client.query<{
          id: string;
          name: string;
          current_balance: string;
          is_everyday: boolean;
        }>(
          `UPDATE accounts
           SET current_balance = $1, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3
           RETURNING id, name, current_balance::text, is_everyday`,
          [fromCents(input.balanceCents), input.accountId, input.tenantId],
        );
        const row = result.rows[0];
        if (!row) {
          throw new Error("Not found");
        }

        await runEvaluationPipeline(client, {
          tenantId: input.tenantId,
          userId: input.userId,
          trigger: "sync",
        });

        this.logInfo("Account balance updated", { accountId: input.accountId });
        return {
          id: row.id,
          name: row.name,
          balanceCents: toCents(row.current_balance),
          isEveryday: row.is_everyday,
        };
      },
    );
  }
}

export const accountService = new AccountService();
