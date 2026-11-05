-- Auth.js (@auth/pg-adapter) durability + pipeline retention index (Phase 7 WS2/WS3).
--
-- Sessions stay JWT, and the only provider that uses the adapter is the Resend email
-- (magic-link) provider. That flow needs `verification_token` and the adapter's
-- `users."emailVerified"` / `image` columns. It never calls the adapter's `accounts`
-- or `sessions` methods (those are OAuth / database-session only), and `accounts` is
-- already Orbit's bank-accounts table, so the adapter's `accounts` is intentionally NOT created.

ALTER TABLE users ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT NULL;

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  token      TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE INDEX IF NOT EXISTS idx_verification_token_expires ON verification_token (expires);

-- Retention + ops: find all runs for a cron tick and prune by age.
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_cron_batch
  ON pipeline_runs (cron_batch_id) WHERE cron_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started
  ON pipeline_runs (started_at);

-- Crash-safe sweep resume: store the planned moves so a pending retry
-- never recomputes from post-move balances and double-applies (D6).
ALTER TABLE cycle_sweeps
  ADD COLUMN IF NOT EXISTS moves JSONB NOT NULL DEFAULT '[]'::jsonb;
