-- Phase 10: catch-up resilience and money continuity.
-- Must be applied BEFORE the Phase 10 code deploys (docs/12-deploy.md). Additive only.

-- WS2: a tenant whose midnight run keeps failing is skipped by catch-up for 24 hours
-- after three consecutive failures, so one bad household cannot eat every tick.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS midnight_fail_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS midnight_fail_until TIMESTAMPTZ NULL;

-- WS3: an undo is its own ledger row. It points at the row it reverses, and a row can be
-- reversed at most once.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS reverses_transaction_id UUID NULL REFERENCES transactions(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reverses
  ON transactions (reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;
