import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { checkDatabase, getPool, withTransaction } from "@/lib/db/connection";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { toCents } from "@/lib/money/numeric";

config({ path: ".env" });

describe("neon integration", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it("connects with DATABASE_URL", async () => {
    await expect(checkDatabase()).resolves.toBe(true);
  });

  it("reads Harbor allowance under tenant session", async () => {
    const snap = await withTransaction(
      { tenantId: HARBOR.tenantId, userId: HARBOR.blairId },
      async (client) => {
        const result = await client.query<{ s_today: string; n_p: number }>(
          `SELECT s_today::text, n_p FROM allowance_snapshots WHERE tenant_id = $1`,
          [HARBOR.tenantId],
        );
        return result.rows[0];
      },
    );
    expect(snap).toBeDefined();
    expect(snap?.n_p).toBeGreaterThanOrEqual(1);
    expect(toCents(snap?.s_today ?? "0")).not.toBeNaN();
  });
});
