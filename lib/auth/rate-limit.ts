import { createHash } from "node:crypto";
import { withTransaction } from "@/lib/db/connection";

/** Magic-link requests allowed per email per window. */
export const MAGIC_LINK_LIMIT = 5;
export const MAGIC_LINK_WINDOW_SECONDS = 15 * 60;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests counted in the current window, this one included. */
  hits: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

/**
 * Key for one email's magic-link counter. The address is hashed so the table never
 * holds anyone's email, and normalised so casing cannot dodge the limit.
 */
export function magicLinkRateLimitKey(email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `magic-link:${digest}`;
}

/**
 * Count one hit against `key` in a fixed window and say whether it is within `limit`.
 * One atomic upsert, so concurrent requests cannot both slip under the limit.
 * The window starts at the first hit and resets once it has fully elapsed.
 */
export async function consumeRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const result = await client.query<{ hits: number; retry_after: number }>(
      `INSERT INTO auth_rate_limits AS r (key, hits, window_started)
       VALUES ($1, 1, NOW())
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE
           WHEN r.window_started <= NOW() - make_interval(secs => $2::int) THEN 1
           ELSE r.hits + 1
         END,
         window_started = CASE
           WHEN r.window_started <= NOW() - make_interval(secs => $2::int) THEN NOW()
           ELSE r.window_started
         END
       RETURNING r.hits,
         GREATEST(0, CEIL(EXTRACT(EPOCH FROM
           (r.window_started + make_interval(secs => $2::int) - NOW()))))::int AS retry_after`,
      [input.key, input.windowSeconds],
    );
    const row = result.rows[0];
    return {
      allowed: row.hits <= input.limit,
      hits: row.hits,
      retryAfterSeconds: row.retry_after,
    };
  });
}

/** Drop counters whose window ended long ago. Housekeeping; safe to skip. */
export async function pruneRateLimits(olderThanSeconds: number): Promise<number> {
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const result = await client.query(
      `DELETE FROM auth_rate_limits
       WHERE window_started < NOW() - make_interval(secs => $1::int)`,
      [olderThanSeconds],
    );
    return result.rowCount ?? 0;
  });
}
