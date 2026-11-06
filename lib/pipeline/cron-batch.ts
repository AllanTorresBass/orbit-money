import { randomUUID } from "node:crypto";
import { withTransaction } from "@/lib/db/connection";
import { logger } from "@/lib/logger";
import type { CronBatchCounts } from "@/types/pipeline/pipeline.types";

/** Open a batch row before any tenant runs. Returns the id every run in the tick carries. */
export async function startCronBatch(input: {
  dueCount: number;
  meta: Record<string, unknown>;
}): Promise<string> {
  const id = randomUUID();
  await withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    await client.query(
      `INSERT INTO cron_batches (id, due_count, meta) VALUES ($1, $2, $3::jsonb)`,
      [id, input.dueCount, JSON.stringify(input.meta)],
    );
  });
  return id;
}

/** Close the batch with its counters. A failure here is logged, never thrown. */
export async function finishCronBatch(
  id: string,
  counts: CronBatchCounts,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      await client.query(
        `UPDATE cron_batches
         SET finished_at = NOW(), due_count = $2, ok_count = $3, error_count = $4,
             skipped_count = $5, meta = meta || $6::jsonb
         WHERE id = $1`,
        [
          id,
          counts.dueCount,
          counts.okCount,
          counts.errorCount,
          counts.skippedCount,
          JSON.stringify(meta),
        ],
      );
    });
  } catch (error: unknown) {
    logger.error("Could not finish cron batch", {
      cronBatchId: id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Close batches a crashed or timed-out tick never finished. A batch still open after
 * `minutes` can never finish on its own. `excludeId` keeps the current tick's row open.
 * A failure is logged, never thrown. Returns how many rows were closed.
 */
export async function finishStaleCronBatches(input: {
  minutes: number;
  excludeId?: string;
}): Promise<number> {
  try {
    return await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      const result = await client.query(
        `UPDATE cron_batches
         SET finished_at = NOW(), meta = meta || '{"abandoned": true}'::jsonb
         WHERE finished_at IS NULL
           AND started_at < NOW() - make_interval(mins => $1::int)
           AND ($2::uuid IS NULL OR id <> $2::uuid)`,
        [input.minutes, input.excludeId ?? null],
      );
      return result.rowCount ?? 0;
    });
  } catch (error: unknown) {
    logger.error("Could not close stale cron batches", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return 0;
  }
}
