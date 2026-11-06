import { randomUUID } from "node:crypto";
import { withTransaction } from "@/lib/db/connection";

/**
 * Ensure a users row exists for magic-link / Create bootstrap.
 * Does not create a membership — Create or invite does that.
 */
export async function ensureUserByEmail(input: {
  email: string;
  name?: string;
}): Promise<{ id: string; email: string; name: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  return withTransaction(null, async (client) => {
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const existing = await client.query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM users WHERE email = $1`,
      [email],
    );
    if (existing.rows[0]) {
      return { ...existing.rows[0], created: false };
    }
    const id = randomUUID();
    const name = input.name?.trim() || email.split("@")[0] || "Orbit";
    await client.query(`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`, [
      id,
      email,
      name,
    ]);
    return { id, email, name, created: true };
  });
}
