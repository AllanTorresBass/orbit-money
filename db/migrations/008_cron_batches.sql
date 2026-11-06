-- Phase 8 WS3: one row per midnight tick, and richer run metadata.
CREATE TABLE IF NOT EXISTS cron_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ NULL,
  due_count      INT NOT NULL DEFAULT 0,
  ok_count       INT NOT NULL DEFAULT 0,
  error_count    INT NOT NULL DEFAULT 0,
  skipped_count  INT NOT NULL DEFAULT 0,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cron_batches_started
  ON cron_batches (started_at DESC);

-- Not tenant data: only the cron job (bypass flag) reads or writes it.
ALTER TABLE cron_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_batches FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY cron_batches_bypass_only ON cron_batches
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS triggered_by_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS reason_code VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS cash_cents BIGINT NULL;

-- No future inflow publishes a zero rate with no day count (D8).
ALTER TABLE allowance_snapshots ALTER COLUMN n_p DROP NOT NULL;
