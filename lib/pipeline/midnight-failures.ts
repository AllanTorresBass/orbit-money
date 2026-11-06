import { withTransaction } from "@/lib/db/connection";
import { logger } from "@/lib/logger";
import {
  MAX_CONSECUTIVE_MIDNIGHT_FAILURES,
  POISON_SKIP_HOURS,
} from "@/lib/pipeline/stale-tenants";

/**
 * Track consecutive midnight failures for one tenant. A success clears the count. The third
 * failure in a row rests the tenant from catch-up for 24 hours. A failure here is logged,
 * never thrown, so bookkeeping cannot fail the tick.
 */
export async function recordMidnightOutcome(tenantId: string, ok: boolean): Promise<void> {
  try {
    await withTransaction(null, async (client) => {
      await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
      if (ok) {
        await client.query(
          `UPDATE tenants
           SET midnight_fail_count = 0, midnight_fail_until = NULL
           WHERE id = $1 AND (midnight_fail_count <> 0 OR midnight_fail_until IS NOT NULL)`,
          [tenantId],
        );
        return;
      }
      const result = await client.query<{ midnight_fail_count: number }>(
        `UPDATE tenants
         SET midnight_fail_count = midnight_fail_count + 1,
             midnight_fail_until = CASE
               WHEN midnight_fail_count + 1 >= $2::int
                 THEN NOW() + make_interval(hours => $3::int)
               ELSE midnight_fail_until
             END
         WHERE id = $1
         RETURNING midnight_fail_count`,
        [tenantId, MAX_CONSECUTIVE_MIDNIGHT_FAILURES, POISON_SKIP_HOURS],
      );
      const count = result.rows[0]?.midnight_fail_count ?? 0;
      if (count >= MAX_CONSECUTIVE_MIDNIGHT_FAILURES) {
        logger.warn("Midnight failed repeatedly; catch-up will skip this tenant", {
          tenantId,
          failCount: count,
          skipHours: POISON_SKIP_HOURS,
        });
      }
    });
  } catch (error: unknown) {
    logger.error("Could not record midnight outcome", {
      tenantId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
