import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";

config({ path: ".env" });

const OTHER_TENANT = "99999999-9999-9999-9999-999999999999";

describe("RLS tenant isolation", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it("returns no Harbor rows when the session tenant does not match", async () => {
    const rows = await withTransaction(
      { tenantId: OTHER_TENANT, userId: HARBOR.blairId },
      async (client) => {
        const allowance = await client.query(
          `SELECT tenant_id FROM allowance_snapshots WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        const envelopes = await client.query(
          `SELECT id FROM envelopes WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        const accounts = await client.query(
          `SELECT id FROM accounts WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        return {
          allowance: allowance.rowCount ?? 0,
          envelopes: envelopes.rowCount ?? 0,
          accounts: accounts.rowCount ?? 0,
        };
      },
    );

    expect(rows).toEqual({ allowance: 0, envelopes: 0, accounts: 0 });
  });
});
