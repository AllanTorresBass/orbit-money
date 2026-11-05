CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  tenant_type     VARCHAR(20) NOT NULL
                    CHECK (tenant_type IN ('individual', 'household', 'organization')),
  base_currency   CHAR(3) NOT NULL DEFAULT 'USD',
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  holiday_region  TEXT NOT NULL DEFAULT 'US',
  liquidity_floor NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(254) NOT NULL UNIQUE,
  name       VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL
                CHECK (role IN ('owner', 'admin', 'member', 'read_only', 'advisor')),
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('invited', 'active', 'suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,
  current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  is_everyday     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS envelopes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  name                 VARCHAR(100) NOT NULL,
  tier_category        VARCHAR(20) NOT NULL
                         CHECK (tier_category IN ('fixed', 'sinking', 'discretionary')),
  priority_order       INT NOT NULL,
  current_balance      NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  target_cap           NUMERIC(12, 2) NULL,
  monthly_installment  NUMERIC(12, 2) NULL,
  rollover_policy      VARCHAR(20) NOT NULL
                         CHECK (rollover_policy IN ('accumulate', 'top_up', 'reset_sweep')),
  sweep_envelope_id    UUID NULL REFERENCES envelopes(id),
  CONSTRAINT envelopes_rollover_matches_tier CHECK (
    (tier_category = 'fixed' AND rollover_policy = 'top_up') OR
    (tier_category = 'sinking' AND rollover_policy = 'accumulate') OR
    (tier_category = 'discretionary' AND rollover_policy = 'reset_sweep')
  ),
  UNIQUE (tenant_id, tier_category, priority_order)
);

CREATE UNIQUE INDEX IF NOT EXISTS envelopes_one_discretionary
  ON envelopes (tenant_id)
  WHERE tier_category = 'discretionary';

CREATE TABLE IF NOT EXISTS scheduled_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  envelope_id       UUID REFERENCES envelopes(id) ON DELETE SET NULL,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title             VARCHAR(120) NOT NULL,
  amount            NUMERIC(12, 2) NOT NULL,
  direction         VARCHAR(10) NOT NULL
                      CHECK (direction IN ('inflow', 'outflow')),
  recurrence_rrule  VARCHAR(100) NOT NULL,
  next_due_date     DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  envelope_id     UUID REFERENCES envelopes(id) ON DELETE RESTRICT,
  amount          NUMERIC(12, 2) NOT NULL,
  booked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  booked_date     DATE NOT NULL,
  memo            TEXT,
  settled_at      TIMESTAMPTZ NULL,
  idempotency_key TEXT NOT NULL,
  external_id     TEXT NULL,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE IF NOT EXISTS allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  envelope_id    UUID NOT NULL REFERENCES envelopes(id),
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  UNIQUE (transaction_id, envelope_id)
);

CREATE TABLE IF NOT EXISTS allowance_snapshots (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  as_of_date  DATE NOT NULL,
  s_daily     NUMERIC(12, 2) NOT NULL,
  s_today     NUMERIC(12, 2) NOT NULL,
  n_p         INT NOT NULL CHECK (n_p >= 1),
  o_unfunded  NUMERIC(12, 2) NOT NULL,
  mitigated   BOOLEAN NOT NULL DEFAULT FALSE,
  next_payday DATE NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecast_days (
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_offset         INT NOT NULL CHECK (day_offset BETWEEN 0 AND 60),
  forecast_date      DATE NOT NULL,
  balance            NUMERIC(12, 2) NOT NULL,
  inflow             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scheduled_outflow  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  assumed_burn       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status             VARCHAR(10) NOT NULL CHECK (status IN ('ok', 'warning', 'breach')),
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, day_offset)
);

CREATE TABLE IF NOT EXISTS envelope_proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  envelope_id  UUID NULL REFERENCES envelopes(id),
  proposed_by  UUID NOT NULL REFERENCES users(id),
  payload      JSONB NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected')),
  resolved_by  UUID NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS cycle_sweeps (
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  cycle_end_date          DATE NOT NULL,
  amount                  NUMERIC(12, 2) NOT NULL,
  destination_envelope_id UUID NOT NULL REFERENCES envelopes(id),
  PRIMARY KEY (tenant_id, cycle_end_date)
);

CREATE TABLE IF NOT EXISTS envelope_access_overrides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  envelope_id      UUID NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_level VARCHAR(20) NOT NULL
                     CHECK (permission_level IN ('full', 'spend_only', 'hidden')),
  UNIQUE (envelope_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_tenant_tier ON envelopes (tenant_id, tier_category, priority_order);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON scheduled_schedules (tenant_id, is_active, next_due_date);
CREATE INDEX IF NOT EXISTS idx_transactions_booked ON transactions (tenant_id, booked_date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_envelope ON transactions (envelope_id);

-- RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelopes FORCE ROW LEVEL SECURITY;
ALTER TABLE scheduled_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE allowance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE forecast_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_days FORCE ROW LEVEL SECURITY;
ALTER TABLE envelope_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelope_proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE cycle_sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_sweeps FORCE ROW LEVEL SECURITY;
ALTER TABLE envelope_access_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelope_access_overrides FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenants_isolation ON tenants
    USING (
      current_setting('app.bypass_rls', true) = 'on'
      OR id::text = current_setting('app.current_tenant_id', true)
      OR EXISTS (
        SELECT 1 FROM tenant_memberships m
        WHERE m.tenant_id = tenants.id
          AND m.user_id::text = current_setting('app.current_user_id', true)
          AND m.status = 'active'
      )
    )
    WITH CHECK (
      current_setting('app.bypass_rls', true) = 'on'
      OR id::text = current_setting('app.current_tenant_id', true)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY memberships_isolation ON tenant_memberships
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY accounts_isolation ON accounts
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY envelopes_isolation ON envelopes
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY schedules_isolation ON scheduled_schedules
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY transactions_isolation ON transactions
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY allocations_isolation ON allocations
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY allowance_isolation ON allowance_snapshots
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY forecast_isolation ON forecast_days
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY proposals_isolation ON envelope_proposals
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY sweeps_isolation ON cycle_sweeps
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY overrides_isolation ON envelope_access_overrides
    USING (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true))
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR tenant_id::text = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
