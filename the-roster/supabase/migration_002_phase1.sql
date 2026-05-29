-- Migration 002 — Phase 1 schema rebuild
-- Drops the old stock-game tables and users table; extends artists;
-- creates labels, scrape_raw, artist_stats_daily (v2), contracts, label_history.
-- Run in Supabase SQL Editor after migration_001_raw_stats.sql.

-- ── Drop old tables (migration 001 + schema.sql) ─────────────────────────────
DROP TABLE IF EXISTS market_prices      CASCADE;
DROP TABLE IF EXISTS leagues            CASCADE;
DROP TABLE IF EXISTS artist_stats       CASCADE;
DROP TABLE IF EXISTS track_stats_daily  CASCADE;
DROP TABLE IF EXISTS artist_stats_daily CASCADE;  -- recreated below with new columns

-- Drop old users table (replaced by labels)
DROP TABLE IF EXISTS users CASCADE;

-- ── Extend artists ────────────────────────────────────────────────────────────
ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'emerging'
    CHECK (tier IN ('underground','emerging','rising','established','major')),
  ADD COLUMN IF NOT EXISTS regional_star_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier_updated_at date;

ALTER TABLE artists DROP COLUMN IF EXISTS image_url;

-- ── labels ────────────────────────────────────────────────────────────────────
CREATE TABLE labels (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  label_name  text NOT NULL,
  genre_1     text,
  genre_2     text,
  country     text,
  treasury    numeric(12,2) NOT NULL DEFAULT 400000,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── scrape_raw ────────────────────────────────────────────────────────────────
CREATE TABLE scrape_raw (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id         uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  scraped_at        date NOT NULL,
  monthly_listeners bigint,
  track_playcounts  jsonb,  -- [{track_id, name, playcount}, ...] top-10
  UNIQUE (artist_id, scraped_at)
);

-- ── artist_stats_daily (v2) ───────────────────────────────────────────────────
CREATE TABLE artist_stats_daily (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id            uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  date                 date NOT NULL,
  monthly_listeners    bigint,
  daily_streams_top10  bigint,
  stream_velocity_7d   numeric(8,2),
  listener_growth_28d  numeric(8,2),
  catalog_depth_score  numeric(5,4),
  momentum_score       numeric(5,2),
  UNIQUE (artist_id, date)
);

CREATE INDEX ON artist_stats_daily (artist_id, date DESC);

-- ── contracts ─────────────────────────────────────────────────────────────────
CREATE TABLE contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id            uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  artist_id           uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','expired','dropped')),
  signing_bonus       numeric(10,2) NOT NULL,
  rev_split_label_pct numeric(4,2) NOT NULL,
  term_months         int NOT NULL CHECK (term_months IN (3,6,12)),
  start_date          date NOT NULL,
  end_date            date NOT NULL,
  baseline_listeners  bigint,
  baseline_growth_pct numeric(6,2),
  royalties_earned    numeric(12,2) NOT NULL DEFAULT 0,
  dev_spend_total     numeric(12,2) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON contracts (label_id, status);
CREATE INDEX ON contracts (end_date) WHERE status = 'active';

-- ── label_history ─────────────────────────────────────────────────────────────
CREATE TABLE label_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id             uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  contract_id          uuid NOT NULL REFERENCES contracts(id),
  artist_name          text NOT NULL,
  artist_tier          text NOT NULL,
  listeners_at_signing bigint,
  listeners_at_end     bigint,
  signing_bonus        numeric(10,2) NOT NULL,
  total_royalties      numeric(12,2) NOT NULL DEFAULT 0,
  total_dev_spend      numeric(12,2) NOT NULL DEFAULT 0,
  net_pnl              numeric(12,2) NOT NULL,
  reason               text NOT NULL CHECK (reason IN ('natural','dropped')),
  completed_at         date NOT NULL
);
