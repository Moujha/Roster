-- §5: Development mechanic
-- dev_allocations: one row per contract, stores current playlist/social-push tier
-- release_amplifications: event-triggered boosts with 14-day linear decay

CREATE TABLE IF NOT EXISTS dev_allocations (
  contract_id      UUID PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
  playlist_tier    TEXT NOT NULL DEFAULT 'none'
    CHECK (playlist_tier IN ('none', 'light', 'standard', 'heavy')),
  social_push_tier TEXT NOT NULL DEFAULT 'none'
    CHECK (social_push_tier IN ('none', 'light', 'standard', 'heavy')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dev_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_owns_dev_allocations"
  ON dev_allocations FOR ALL
  USING  (contract_id IN (SELECT id FROM contracts WHERE label_id = auth.uid()))
  WITH CHECK (contract_id IN (SELECT id FROM contracts WHERE label_id = auth.uid()));

CREATE TABLE IF NOT EXISTS release_amplifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id         UUID NOT NULL REFERENCES auth.users(id),
  contract_id      UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  artist_id        UUID NOT NULL REFERENCES artists(id),
  spend_tier       TEXT NOT NULL CHECK (spend_tier IN ('light', 'standard', 'heavy')),
  peak_multiplier  FLOAT NOT NULL,
  cost             NUMERIC(12,2) NOT NULL,
  triggered_at     DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at       DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE release_amplifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_owns_release_amps"
  ON release_amplifications FOR ALL
  USING  (auth.uid() = label_id)
  WITH CHECK (auth.uid() = label_id);
