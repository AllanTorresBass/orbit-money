-- Phase 9: abuse guards, run error text, and archived envelopes.
-- Must be applied BEFORE the Phase 9 code deploys (docs/12-deploy.md).

-- WS3: fixed-window counters for the magic-link request path. Not tenant data.
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key             TEXT PRIMARY KEY,
  hits            INT NOT NULL DEFAULT 0,
  window_started  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_rate_limits FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY auth_rate_limits_bypass_only ON auth_rate_limits
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- WS4: a short, truncated message for runs that errored or were abandoned.
ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS error_message VARCHAR(256) NULL;

-- WS5: removing a bill or goal archives its envelope instead of deleting history.
ALTER TABLE envelopes
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_envelopes_active
  ON envelopes (tenant_id, tier_category, priority_order)
  WHERE archived_at IS NULL;
