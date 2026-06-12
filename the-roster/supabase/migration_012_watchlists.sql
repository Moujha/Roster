-- Migration 012 — Watchlist table (GDD §9.3)

CREATE TABLE watchlists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id   uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  artist_id  uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (label_id, artist_id)
);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read any watchlist (public visibility per GDD §9.3)
CREATE POLICY "watchlists: readable by all authenticated" ON watchlists
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only insert/delete their own rows
CREATE POLICY "watchlists: own label insert" ON watchlists
  FOR INSERT WITH CHECK (auth.uid() = label_id);

CREATE POLICY "watchlists: own label delete" ON watchlists
  FOR DELETE USING (auth.uid() = label_id);
