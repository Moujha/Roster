-- Migration 004 — Row Level Security policies for all Phase 1 tables

-- ── labels ────────────────────────────────────────────────────────────────────
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labels: own row" ON labels
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ── contracts ─────────────────────────────────────────────────────────────────
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts: own label" ON contracts
  FOR ALL USING (auth.uid() = label_id) WITH CHECK (auth.uid() = label_id);

-- ── label_history ─────────────────────────────────────────────────────────────
ALTER TABLE label_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_history: own label" ON label_history
  FOR ALL USING (auth.uid() = label_id) WITH CHECK (auth.uid() = label_id);

-- ── artists ───────────────────────────────────────────────────────────────────
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artists: readable by all authenticated" ON artists
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── artist_stats_daily ────────────────────────────────────────────────────────
ALTER TABLE artist_stats_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_stats_daily: readable by all authenticated" ON artist_stats_daily
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── scrape_raw ────────────────────────────────────────────────────────────────
ALTER TABLE scrape_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scrape_raw: readable by all authenticated" ON scrape_raw
  FOR SELECT USING (auth.role() = 'authenticated');
