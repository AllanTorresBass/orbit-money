import { readdirSync } from "node:fs";
import { join } from "node:path";
import { withTransaction } from "@/lib/db/connection";
import { logger } from "@/lib/logger";
import type { HealthMigrations, HealthResponse } from "@/types/pipeline/pipeline.types";

/** `.sql` files shipped in `db/migrations`. Null when the folder cannot be read. */
export function countExpectedMigrations(dir?: string): number | null {
  try {
    const folder = dir ?? join(process.cwd(), "db", "migrations");
    return readdirSync(folder).filter((file) => file.endsWith(".sql")).length;
  } catch (error: unknown) {
    logger.warn("Could not list migration files", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/** True when the database has every migration the code shipped with. Unknown counts as in sync. */
export function migrationsInSync(migrations: HealthMigrations): boolean {
  return migrations.expected === null || migrations.applied >= migrations.expected;
}

/** Overall verdict: the database answers and no shipped migration is missing from it. */
export function evaluateHealth(input: {
  db: boolean;
  migrations: HealthMigrations;
  cronBatchAgeSec: number | null;
}): HealthResponse {
  return {
    ok: input.db && migrationsInSync(input.migrations),
    db: input.db,
    migrations: input.migrations,
    cronBatchAgeSec: input.cronBatchAgeSec,
  };
}

/**
 * Database reachability, migration counts, and the age of the newest finished cron batch.
 * A query that fails reads as "not healthy" rather than throwing.
 */
export async function loadHealth(options?: { migrationsDir?: string }): Promise<HealthResponse> {
  const expected = countExpectedMigrations(options?.migrationsDir);
  try {
    const snapshot = await withTransaction(null, async (client) => {
      // cron_batches is readable only with the bypass flag.
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      await client.query("SELECT 1");
      // A failed query would abort the transaction, so look for the table first.
      const present = await client.query<{ present: boolean }>(
        "SELECT to_regclass('orbit.schema_migrations') IS NOT NULL AS present",
      );
      let applied = 0;
      if (present.rows[0]?.present) {
        const counted = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM schema_migrations",
        );
        applied = Number(counted.rows[0]?.count ?? "0");
      }
      const batch = await client.query<{ age: string | null }>(
        `SELECT EXTRACT(EPOCH FROM (NOW() - MAX(finished_at)))::bigint::text AS age
         FROM cron_batches WHERE finished_at IS NOT NULL`,
      );
      const ageText = batch.rows[0]?.age ?? null;
      return { applied, cronBatchAgeSec: ageText === null ? null : Number(ageText) };
    });
    return evaluateHealth({
      db: true,
      migrations: { applied: snapshot.applied, expected },
      cronBatchAgeSec: snapshot.cronBatchAgeSec,
    });
  } catch (error: unknown) {
    logger.error("Health query failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return evaluateHealth({
      db: false,
      migrations: { applied: 0, expected },
      cronBatchAgeSec: null,
    });
  }
}
