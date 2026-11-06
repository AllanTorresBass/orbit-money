import type { PoolClient } from "pg";

/**
 * Serialize money writes for one tenant until the transaction ends.
 * Re-entrant within one connection, so a purchase and the pipeline it runs can both take it.
 */
export async function lockTenantForUpdate(client: PoolClient, tenantId: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [tenantId]);
}
