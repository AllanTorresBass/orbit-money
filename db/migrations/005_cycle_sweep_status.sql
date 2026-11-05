-- Crash-safe cycle sweeps: pending until envelope moves commit (D6).
ALTER TABLE cycle_sweeps
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'applied'
    CHECK (status IN ('pending', 'applied'));
