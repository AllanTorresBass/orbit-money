-- Correlated pipeline runs/steps for how/when/where/why (Phase 7).
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger         VARCHAR(20) NOT NULL CHECK (trigger IN ('sync', 'midnight')),
  as_of_date      DATE NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'ok', 'stale', 'error')),
  forecast_stale  BOOLEAN NOT NULL DEFAULT FALSE,
  cuts_applied    INT NOT NULL DEFAULT 0,
  o_unfunded      NUMERIC(12, 2) NULL,
  s_daily         NUMERIC(12, 2) NULL,
  s_today         NUMERIC(12, 2) NULL,
  n_p             INT NULL,
  transaction_id  UUID NULL,
  cron_batch_id   UUID NULL,
  error_code      VARCHAR(64) NULL,
  sweep_incomplete BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS pipeline_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step         VARCHAR(32) NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms  INT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_tenant_date
  ON pipeline_runs (tenant_id, as_of_date DESC, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_run
  ON pipeline_steps (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_transactions_unsettled
  ON transactions (tenant_id) WHERE settled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_envelope_booked
  ON transactions (tenant_id, envelope_id, booked_date);
CREATE INDEX IF NOT EXISTS idx_schedules_inflow_due
  ON scheduled_schedules (tenant_id, direction, next_due_date)
  WHERE is_active = TRUE;

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE pipeline_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_steps FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY pipeline_runs_isolation ON pipeline_runs
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY pipeline_steps_isolation ON pipeline_steps
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
