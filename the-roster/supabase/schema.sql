-- ─────────────────────────────────────────────────────────────────
-- THE ROSTER — Database Schema
-- Paste this into the Supabase SQL Editor and run it.
-- ─────────────────────────────────────────────────────────────────

-- artists
-- ─────────────────────────────────────────────────────────────────
create table artists (
  id         uuid primary key default gen_random_uuid(),
  spotify_id text unique not null,
  name       text not null,
  image_url  text,
  genre      text,
  country    text,
  created_at timestamptz not null default now()
);

-- artist_stats
-- ─────────────────────────────────────────────────────────────────
create table artist_stats (
  id                        uuid primary key default gen_random_uuid(),
  artist_id                 uuid not null references artists(id) on delete cascade,
  date                      date not null,
  spotify_monthly_listeners bigint,
  spotify_streams_7d        bigint,
  ig_followers              bigint,
  tiktok_followers          bigint,
  tiktok_views_7d           bigint,
  chart_position            int,
  score_total               numeric(6, 2),
  score_breakdown           jsonb,
  unique (artist_id, date)
);

-- market_prices
-- ─────────────────────────────────────────────────────────────────
create table market_prices (
  id               uuid primary key default gen_random_uuid(),
  artist_id        uuid not null references artists(id) on delete cascade,
  date             date not null,
  price            numeric(10, 2) not null,
  price_change_pct numeric(5, 2),
  unique (artist_id, date)
);

-- leagues
-- ─────────────────────────────────────────────────────────────────
create table leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  season      int not null,
  start_date  date,
  end_date    date,
  max_players int not null default 10,
  created_at  timestamptz not null default now()
);

-- users (extends auth.users — same id)
-- ─────────────────────────────────────────────────────────────────
create table users (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  budget     numeric(12, 2) not null default 1000000,
  league_id  uuid references leagues(id) on delete set null,
  created_at timestamptz not null default now()
);

-- rosters
-- ─────────────────────────────────────────────────────────────────
create table rosters (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  artist_id      uuid not null references artists(id) on delete cascade,
  shares_owned   int not null default 1,
  acquired_price numeric(10, 2) not null,
  acquired_at    timestamptz not null default now(),
  unique (user_id, artist_id)
);

-- transactions
-- ─────────────────────────────────────────────────────────────────
create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  artist_id   uuid not null references artists(id) on delete cascade,
  type        text not null check (type in ('buy', 'sell')),
  price       numeric(10, 2) not null,
  shares      int not null,
  executed_at timestamptz not null default now()
);

-- Indexes
-- ─────────────────────────────────────────────────────────────────
create index on artist_stats (artist_id, date desc);
create index on market_prices (artist_id, date desc);
create index on rosters (user_id);
create index on transactions (user_id, executed_at desc);
