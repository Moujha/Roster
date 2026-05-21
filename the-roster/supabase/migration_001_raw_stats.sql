-- Migration 001 — raw Spotify scraper tables
-- Run this in the Supabase SQL Editor after schema.sql

-- artist_stats_daily: one snapshot per artist per day (monthly listeners, followers)
create table artist_stats_daily (
  id               uuid primary key default gen_random_uuid(),
  artist_id        uuid not null references artists(id) on delete cascade,
  scraped_at       date not null,
  monthly_listeners int,
  followers        int,
  unique (artist_id, scraped_at)
);

-- track_stats_daily: one playcount row per track per day
create table track_stats_daily (
  id               uuid primary key default gen_random_uuid(),
  artist_id        uuid not null references artists(id) on delete cascade,
  spotify_track_id text not null,
  track_name       text,
  album_id         text,
  playcount        bigint,
  scraped_at       date not null,
  unique (spotify_track_id, scraped_at)
);

create index on artist_stats_daily (artist_id, scraped_at desc);
create index on track_stats_daily  (artist_id, scraped_at desc);
create index on track_stats_daily  (spotify_track_id, scraped_at desc);
