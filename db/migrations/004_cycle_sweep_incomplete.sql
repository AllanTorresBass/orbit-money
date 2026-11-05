-- Record when a cycle-end sweep could not move every leftover cent (docs/08).
ALTER TABLE cycle_sweeps
  ADD COLUMN IF NOT EXISTS incomplete BOOLEAN NOT NULL DEFAULT FALSE;
