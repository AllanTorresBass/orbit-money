-- This Neon database is shared. biomeg has its own schema. Mercampo and Neon Auth
-- stay in public (account, user, session, verification, mercampo_*).
-- Orbit gets one schema for every tenant. Do not set search_path on the login
-- role: the other apps connect as the same owner and must keep resolving public.

CREATE SCHEMA IF NOT EXISTS orbit;

REVOKE ALL ON SCHEMA orbit FROM PUBLIC;

DO $$
DECLARE
  tbl text;
  -- Orbit only. public.account / public.user belong to Neon Auth.
  tables text[] := ARRAY[
    'tenants',
    'users',
    'tenant_memberships',
    'accounts',
    'envelopes',
    'scheduled_schedules',
    'transactions',
    'allocations',
    'allowance_snapshots',
    'forecast_days',
    'envelope_proposals',
    'cycle_sweeps',
    'envelope_access_overrides',
    'pipeline_runs',
    'pipeline_steps',
    'verification_token',
    'cron_batches',
    'auth_rate_limits',
    'schema_migrations'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA orbit', tbl);
    ELSIF to_regclass(format('orbit.%I', tbl)) IS NULL THEN
      RAISE EXCEPTION 'Orbit table % is not in public or orbit', tbl;
    END IF;
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA orbit TO orbit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA orbit TO orbit_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA orbit TO orbit_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA orbit
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orbit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA orbit
  GRANT USAGE, SELECT ON SEQUENCES TO orbit_app;
