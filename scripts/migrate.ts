import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { getUnpooledPool } from "../lib/db/connection";
import { logger } from "../lib/logger";

config({ path: ".env" });

async function main(): Promise<void> {
  const pool = getUnpooledPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const dir = join(process.cwd(), "db/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE id = $1",
        [file],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        logger.info("Migration already applied", { file });
        continue;
      }

      const sql = readFileSync(join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
        await client.query("COMMIT");
        logger.info("Applied migration", { file });
      } catch (error: unknown) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error("Migration failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
