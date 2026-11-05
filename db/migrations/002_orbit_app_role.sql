-- Neon owner roles often have BYPASSRLS, which ignores FORCE ROW LEVEL SECURITY.
-- Request transactions SET LOCAL ROLE orbit_app so policies actually apply.

DO $$ BEGIN
  CREATE ROLE orbit_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

GRANT USAGE ON SCHEMA public TO orbit_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orbit_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO orbit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orbit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO orbit_app;

-- Allow the connecting role (Neon owner) to assume orbit_app for the transaction.
DO $$ BEGIN
  EXECUTE format('GRANT orbit_app TO %I', current_user);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not GRANT orbit_app TO current_user: %', SQLERRM;
END $$;
