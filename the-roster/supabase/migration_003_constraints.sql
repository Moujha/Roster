-- Prevent duplicate active contracts for the same artist per label
CREATE UNIQUE INDEX IF NOT EXISTS contracts_label_artist_active_idx
  ON contracts (label_id, artist_id)
  WHERE status = 'active';

-- Prevent negative treasury at DB level
ALTER TABLE labels ADD CONSTRAINT labels_treasury_non_negative CHECK (treasury >= 0);
