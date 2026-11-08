-- Per-person UI language (en | es). Household timezone stays on tenants.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'en'
    CHECK (preferred_locale IN ('en', 'es'));
