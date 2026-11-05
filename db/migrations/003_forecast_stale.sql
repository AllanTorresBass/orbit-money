-- Mark when holiday calendar failure kept the previous forecast (docs/08 fail-closed).
ALTER TABLE allowance_snapshots
  ADD COLUMN IF NOT EXISTS forecast_stale BOOLEAN NOT NULL DEFAULT FALSE;
