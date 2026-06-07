-- §4 v1.1: Points-based negotiation system
-- Adds hidden priority weights + target score to artists, and a negotiations state table.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS priority_money FLOAT NOT NULL DEFAULT 0.33,
  ADD COLUMN IF NOT EXISTS priority_freedom FLOAT NOT NULL DEFAULT 0.34,
  ADD COLUMN IF NOT EXISTS priority_commitment FLOAT NOT NULL DEFAULT 0.33,
  ADD COLUMN IF NOT EXISTS negotiation_target INT NOT NULL DEFAULT 65;

-- Back-fill tier-appropriate weights for existing artists
DO $$
DECLARE
  rec RECORD;
  m FLOAT; f FLOAT; c FLOAT; total FLOAT;
BEGIN
  FOR rec IN SELECT id, tier FROM artists LOOP
    IF rec.tier IN ('underground', 'emerging') THEN
      f := 0.40 + random() * 0.20;
      m := 0.10 + random() * 0.20;
      c := 1.0 - f - m;
    ELSIF rec.tier = 'rising' THEN
      c := 0.40 + random() * 0.20;
      f := 0.10 + random() * 0.20;
      m := 1.0 - c - f;
    ELSE
      m := 0.40 + random() * 0.20;
      f := 0.10 + random() * 0.20;
      c := 1.0 - m - f;
    END IF;
    c := GREATEST(c, 0.05);
    total := m + f + c;
    UPDATE artists SET
      priority_money      = m / total,
      priority_freedom    = f / total,
      priority_commitment = c / total,
      negotiation_target  = 55 + floor(random() * 21)::int
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Negotiation sessions: one row per label×artist attempt
CREATE TABLE IF NOT EXISTS negotiations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id         UUID NOT NULL REFERENCES auth.users(id),
  artist_id        UUID NOT NULL REFERENCES artists(id),
  round            INT  NOT NULL DEFAULT 1,
  status           TEXT NOT NULL CHECK (status IN ('countered', 'accepted', 'rejected', 'cooling_off')),
  offer            JSONB NOT NULL,
  counter_offer    JSONB,
  cooling_off_until DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_owns_negotiations"
  ON negotiations FOR ALL
  USING (auth.uid() = label_id)
  WITH CHECK (auth.uid() = label_id);
