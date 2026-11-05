import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

let pooled: Pool | null = null;
let unpooled: Pool | null = null;

function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
}

export function getPool(): Pool {
  if (!pooled) {
    pooled = createPool(getEnv().DATABASE_URL);
  }
  return pooled;
}

export function getUnpooledPool(): Pool {
  if (!unpooled) {
    unpooled = createPool(getEnv().DATABASE_URL_UNPOOLED);
  }
  return unpooled;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export interface TenantSession {
  tenantId: string;
  userId: string;
}

export async function withTransaction<T>(
  session: TenantSession | null,
  fn: (client: PoolClient) => Promise<T>,
  options?: { unpooled?: boolean },
): Promise<T> {
  const pool = options?.unpooled ? getUnpooledPool() : getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (session) {
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
        session.tenantId,
      ]);
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [session.userId]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    logger.error("Transaction rolled back", {
      error: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<boolean> {
  const result = await query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
