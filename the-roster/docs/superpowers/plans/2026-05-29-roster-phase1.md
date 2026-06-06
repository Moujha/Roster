# Roster Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the-roster codebase to match GDD v1.0 — a record label sim where players sign artists via contracts, earn weekly royalties from real Spotify streams, and manage a $400k starting treasury.

**Architecture:** Python pipeline reads from scrape_raw (written by the existing Playwright scraper), computes Momentum Score and stream velocity into artist_stats_daily, and triggers Sunday royalty payouts. Next.js 16 App Router serves 6 game pages backed by Supabase with a contracts/labels/label_history schema.

**Tech Stack:** Python 3 + pytest + supabase-py, Next.js 16 App Router, Supabase (PostgreSQL + Auth), TypeScript, pixel-art design system (Silkscreen/Jersey 25/Pixelify Sans)

---

## File Structure Map

### New Python files
- `pipeline/compute_metrics.py` — tier classification, daily stream delta, velocity, growth, depth, momentum
- `pipeline/royalties.py` — weekly royalty and buyout penalty calculations
- `pipeline/test_compute_metrics.py` — pytest suite for compute_metrics.py
- `pipeline/test_royalties.py` — pytest suite for royalties.py

### Modified Python files
- `pipeline/db.py` — full rewrite: drop old stock-game helpers, add all Phase 1 DB accessors
- `pipeline/run.py` — full rewrite: daily scrape-to-metrics loop + Sunday royalty trigger
- `pipeline/requirements.txt` — add `pytest>=8.0`
- `pipeline/scraper/supabase_store.py` — replace two functions with single `store_scrape_raw`

### Deleted Python files
- `pipeline/scorer.py` — obsolete points scorer, replaced by compute_metrics.py

### New SQL files
- `supabase/migration_002_phase1.sql` — drops old tables, adds new schema

### New Next.js files
- `src/lib/types.ts` — shared TypeScript interfaces (Label, Artist, Contract, etc.)
- `src/middleware.ts` — auth guard + onboarding redirect
- `src/app/api/labels/route.ts` — POST /api/labels
- `src/app/api/labels/me/route.ts` — GET + PATCH /api/labels/me

### Modified Next.js files
- `src/app/page.tsx` — change redirect target from `/market` to `/dashboard`
- `src/app/(game)/layout.tsx` — update NAV_ITEMS to 4 items, remove COMPETE section

---

## Task 1: DB migration 002

**File to create:** `supabase/migration_002_phase1.sql`

- [ ] Write `supabase/migration_002_phase1.sql` with the following content:

```sql
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
```

- [ ] Verify: paste the following into Supabase SQL Editor and confirm the result lists exactly these tables: `artist_stats_daily`, `artists`, `contracts`, `label_history`, `labels`, `scrape_raw`.

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

- [ ] Commit:

```bash
git add supabase/migration_002_phase1.sql
git commit -m "feat(db): migration 002 — phase 1 schema (labels, scrape_raw, contracts, label_history)"
```

---

## Task 2: Rewrite pipeline/scraper/supabase_store.py

Replace the existing two-function file (which wrote to the now-dropped `artist_stats_daily` and `track_stats_daily`) with a single function that writes to `scrape_raw`.

- [ ] Overwrite `pipeline/scraper/supabase_store.py` with:

```python
"""Upserts raw Spotify scrape results into the scrape_raw table."""
from datetime import date
from typing import Optional
from supabase import Client


def store_scrape_raw(
    client: Client,
    artist_id: str,
    overview: dict,
    scraped_at: Optional[date] = None,
) -> None:
    """Upsert one row into scrape_raw.

    Args:
        client:     Supabase service-role client.
        artist_id:  Internal UUID from the artists table.
        overview:   Dict returned by the Playwright scraper, expected keys:
                      monthly_listeners: int
                      top_tracks: list of {track_id, name, playcount}
        scraped_at: Date to record; defaults to today.
    """
    if scraped_at is None:
        scraped_at = date.today()

    top_tracks = overview.get("top_tracks") or []
    track_playcounts = [
        {"track_id": t["track_id"], "name": t["name"], "playcount": t["playcount"]}
        for t in top_tracks
        if t.get("track_id")
    ]

    row = {
        "artist_id":         artist_id,
        "scraped_at":        scraped_at.isoformat(),
        "monthly_listeners": overview.get("monthly_listeners"),
        "track_playcounts":  track_playcounts or None,
    }
    (
        client.table("scrape_raw")
        .upsert(row, on_conflict="artist_id,scraped_at")
        .execute()
    )
```

- [ ] Verify import resolves (run from `pipeline/` directory):

```bash
python -c "import scraper.supabase_store; print('OK')"
```

Expected output: `OK`

- [ ] Commit:

```bash
git add pipeline/scraper/supabase_store.py
git commit -m "refactor(pipeline): replace supabase_store with store_scrape_raw targeting scrape_raw table"
```

---

## Task 3: Add pytest + compute_metrics.py (TDD)

Write tests first, then implement.

- [ ] Add `pytest>=8.0` to `pipeline/requirements.txt`:

```
supabase>=2.10
spotipy==2.23.0
python-dotenv==1.0.1
httpx==0.27.0
aiohttp>=3.9
websockets>=12.0
curl_cffi>=0.7
pytest>=8.0
```

- [ ] Write `pipeline/test_compute_metrics.py`:

```python
"""Tests for compute_metrics.py — run with: pytest test_compute_metrics.py -v"""
import pytest
from compute_metrics import (
    classify_tier,
    compute_daily_streams,
    compute_stream_velocity_7d,
    compute_listener_growth_28d,
    compute_catalog_depth,
    compute_momentum,
)


# ── classify_tier ─────────────────────────────────────────────────────────────

def test_classify_tier_underground():
    assert classify_tier(0) == "underground"
    assert classify_tier(49_999) == "underground"
    assert classify_tier(50_000) == "underground"  # boundary: 0–50k inclusive

def test_classify_tier_emerging():
    assert classify_tier(50_001) == "emerging"
    assert classify_tier(275_000) == "emerging"
    assert classify_tier(500_000) == "emerging"

def test_classify_tier_rising():
    assert classify_tier(500_001) == "rising"
    assert classify_tier(1_000_000) == "rising"
    assert classify_tier(2_000_000) == "rising"

def test_classify_tier_established():
    assert classify_tier(2_000_001) == "established"
    assert classify_tier(5_000_000) == "established"
    assert classify_tier(10_000_000) == "established"

def test_classify_tier_major():
    assert classify_tier(10_000_001) == "major"
    assert classify_tier(50_000_000) == "major"


# ── compute_daily_streams ─────────────────────────────────────────────────────

def test_compute_daily_streams_basic():
    today = [{"track_id": "a", "playcount": 1000}, {"track_id": "b", "playcount": 500}]
    yesterday = [{"track_id": "a", "playcount": 900}, {"track_id": "b", "playcount": 450}]
    assert compute_daily_streams(today, yesterday) == 150  # 100 + 50

def test_compute_daily_streams_negative_delta_clamped():
    today = [{"track_id": "a", "playcount": 800}]
    yesterday = [{"track_id": "a", "playcount": 900}]
    assert compute_daily_streams(today, yesterday) == 0  # negative clamped to 0

def test_compute_daily_streams_no_yesterday():
    today = [{"track_id": "a", "playcount": 1000}]
    assert compute_daily_streams(today, []) is None

def test_compute_daily_streams_no_matching_tracks():
    today = [{"track_id": "a", "playcount": 1000}]
    yesterday = [{"track_id": "z", "playcount": 800}]
    # No track_ids in common — returns None (no reliable delta)
    assert compute_daily_streams(today, yesterday) is None

def test_compute_daily_streams_partial_overlap():
    today = [{"track_id": "a", "playcount": 100}, {"track_id": "b", "playcount": 200}]
    yesterday = [{"track_id": "a", "playcount": 80}]
    # Only track 'a' matches; track 'b' is new — counted only where overlap exists
    assert compute_daily_streams(today, yesterday) == 20


# ── compute_stream_velocity_7d ────────────────────────────────────────────────

def test_compute_stream_velocity_7d_positive():
    result = compute_stream_velocity_7d(110, 100)
    assert abs(result - 10.0) < 0.01

def test_compute_stream_velocity_7d_negative():
    result = compute_stream_velocity_7d(90, 100)
    assert abs(result - (-10.0)) < 0.01

def test_compute_stream_velocity_7d_zero_prev():
    assert compute_stream_velocity_7d(100, 0) is None

def test_compute_stream_velocity_7d_both_zero():
    assert compute_stream_velocity_7d(0, 0) is None

def test_compute_stream_velocity_7d_zero_current():
    result = compute_stream_velocity_7d(0, 100)
    assert abs(result - (-100.0)) < 0.01


# ── compute_listener_growth_28d ───────────────────────────────────────────────

def test_compute_listener_growth_28d_positive():
    result = compute_listener_growth_28d(110_000, 100_000)
    assert abs(result - 10.0) < 0.01

def test_compute_listener_growth_28d_negative():
    result = compute_listener_growth_28d(80_000, 100_000)
    assert abs(result - (-20.0)) < 0.01

def test_compute_listener_growth_28d_zero_base():
    assert compute_listener_growth_28d(100_000, 0) is None

def test_compute_listener_growth_28d_no_change():
    result = compute_listener_growth_28d(100_000, 100_000)
    assert result == 0.0


# ── compute_catalog_depth ─────────────────────────────────────────────────────

def test_compute_catalog_depth_uniform():
    # 10 tracks all with same playcount → HHI = 10*(0.1^2) = 0.1 → depth = 0.9
    tracks = [{"track_id": str(i), "playcount": 100} for i in range(10)]
    result = compute_catalog_depth(tracks)
    assert abs(result - 0.9) < 0.0001

def test_compute_catalog_depth_single_track():
    # All streams on one track → HHI = 1 → depth = 0
    tracks = [{"track_id": "a", "playcount": 1000}]
    result = compute_catalog_depth(tracks)
    assert result == 0.0

def test_compute_catalog_depth_empty():
    assert compute_catalog_depth([]) is None

def test_compute_catalog_depth_zero_total():
    tracks = [{"track_id": "a", "playcount": 0}, {"track_id": "b", "playcount": 0}]
    assert compute_catalog_depth(tracks) is None

def test_compute_catalog_depth_two_equal():
    tracks = [{"track_id": "a", "playcount": 500}, {"track_id": "b", "playcount": 500}]
    result = compute_catalog_depth(tracks)
    # HHI = 2*(0.5^2) = 0.5 → depth = 0.5
    assert abs(result - 0.5) < 0.0001


# ── compute_momentum ──────────────────────────────────────────────────────────

def test_compute_momentum_sanity_check():
    # GDD sanity check: compute_momentum(50, 28, 0.5) == 53.5
    # v_norm = clamp((50+50)/2, 0, 100) = 50
    # g_norm = clamp((28+20)/0.8, 0, 100) = clamp(60, 0, 100) = 60
    # d_norm = 0.5 * 100 = 50
    # momentum = clamp(50*0.4 + 60*0.35 + 50*0.25, 0, 100)
    #          = clamp(20 + 21 + 12.5, 0, 100) = 53.5
    result = compute_momentum(50.0, 28.0, 0.5)
    assert abs(result - 53.5) < 0.01

def test_compute_momentum_any_none_returns_none():
    assert compute_momentum(None, 28.0, 0.5) is None
    assert compute_momentum(50.0, None, 0.5) is None
    assert compute_momentum(50.0, 28.0, None) is None
    assert compute_momentum(None, None, None) is None

def test_compute_momentum_clamps_to_100():
    # velocity=200, growth=100, depth=1.0 — all norms should max out
    result = compute_momentum(200.0, 100.0, 1.0)
    assert result == 100.0

def test_compute_momentum_clamps_to_0():
    # velocity=-100, growth=-50, depth=0
    result = compute_momentum(-100.0, -50.0, 0.0)
    assert result == 0.0

def test_compute_momentum_all_zeros():
    # v_norm = clamp((0+50)/2, 0, 100) = 25
    # g_norm = clamp((0+20)/0.8, 0, 100) = 25
    # d_norm = 0
    # momentum = 25*0.4 + 25*0.35 + 0*0.25 = 10 + 8.75 = 18.75
    result = compute_momentum(0.0, 0.0, 0.0)
    assert abs(result - 18.75) < 0.01
```

- [ ] Write `pipeline/compute_metrics.py`:

```python
"""Metric computation functions for the Roster data pipeline.

All functions that can return None do so when inputs are insufficient
(e.g. no previous day data, zero-division guards). Callers must handle None
before writing to artist_stats_daily.
"""
from __future__ import annotations


# ── Tier classification ───────────────────────────────────────────────────────

_TIER_THRESHOLDS: list[tuple[int, str]] = [
    (50_000,     "underground"),
    (500_000,    "emerging"),
    (2_000_000,  "rising"),
    (10_000_000, "established"),
]


def classify_tier(monthly_listeners: int) -> str:
    """Return the artist tier string for a given monthly listener count.

    Thresholds (inclusive upper bound):
      underground : 0 – 50,000
      emerging    : 50,001 – 500,000
      rising      : 500,001 – 2,000,000
      established : 2,000,001 – 10,000,000
      major       : 10,000,001+
    """
    for threshold, tier in _TIER_THRESHOLDS:
        if monthly_listeners <= threshold:
            return tier
    return "major"


# ── Stream delta ──────────────────────────────────────────────────────────────

def compute_daily_streams(
    today_tracks: list[dict],
    yesterday_tracks: list[dict],
) -> int | None:
    """Sum positive per-track playcount deltas between today and yesterday.

    Returns None if yesterday_tracks is empty or there are no matching
    track_ids (first scrape, or complete tracklist rotation). Only tracks
    present in both snapshots contribute to the delta.

    Args:
        today_tracks:     List of {track_id, name, playcount} for today.
        yesterday_tracks: List of {track_id, name, playcount} for yesterday.
    """
    if not yesterday_tracks:
        return None

    yesterday_map = {t["track_id"]: t["playcount"] for t in yesterday_tracks if t.get("track_id")}
    if not yesterday_map:
        return None

    matched = 0
    total = 0
    for t in today_tracks:
        tid = t.get("track_id")
        if tid and tid in yesterday_map:
            matched += 1
            total += max(0, t["playcount"] - yesterday_map[tid])

    return total if matched > 0 else None


# ── Stream velocity ───────────────────────────────────────────────────────────

def compute_stream_velocity_7d(
    streams_last_7: int,
    streams_prev_7: int,
) -> float | None:
    """Percentage change in streams: (last7 - prev7) / prev7 * 100.

    Returns None if streams_prev_7 is 0 (division guard).
    """
    if streams_prev_7 == 0:
        return None
    return (streams_last_7 - streams_prev_7) / streams_prev_7 * 100.0


# ── Listener growth ───────────────────────────────────────────────────────────

def compute_listener_growth_28d(
    ml_today: int,
    ml_28d_ago: int,
) -> float | None:
    """Percentage change in monthly listeners over 28 days.

    Returns None if ml_28d_ago is 0.
    """
    if ml_28d_ago == 0:
        return None
    return (ml_today - ml_28d_ago) / ml_28d_ago * 100.0


# ── Catalog depth (Herfindahl-based) ─────────────────────────────────────────

def compute_catalog_depth(tracks: list[dict]) -> float | None:
    """1 - sum(track_share^2) across all tracks in today's snapshot.

    Returns None if tracks is empty or total playcount is 0.
    0 = all streams on one track; ~0.9 = perfectly spread over 10 tracks.
    """
    if not tracks:
        return None

    total = sum(t.get("playcount", 0) or 0 for t in tracks)
    if total == 0:
        return None

    hhi = sum((t.get("playcount", 0) / total) ** 2 for t in tracks)
    return 1.0 - hhi


# ── Momentum score ────────────────────────────────────────────────────────────

def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def compute_momentum(
    velocity: float | None,
    growth: float | None,
    depth: float | None,
) -> float | None:
    """Composite momentum score in the range [0, 100].

    Formula (GDD §4.1):
      v_norm = clamp((velocity + 50) / 2,   0, 100)
      g_norm = clamp((growth   + 20) / 0.8, 0, 100)
      d_norm = depth * 100
      score  = clamp(v_norm*0.4 + g_norm*0.35 + d_norm*0.25, 0, 100)

    Returns None if any input is None.
    """
    if velocity is None or growth is None or depth is None:
        return None

    v_norm = _clamp((velocity + 50.0) / 2.0,   0.0, 100.0)
    g_norm = _clamp((growth   + 20.0) / 0.8,   0.0, 100.0)
    d_norm = depth * 100.0

    return _clamp(v_norm * 0.4 + g_norm * 0.35 + d_norm * 0.25, 0.0, 100.0)
```

- [ ] Install pytest and run tests:

```bash
cd /Users/paulbourdon/Roster/the-roster/pipeline && pip install pytest && pytest test_compute_metrics.py -v
```

Expected: all tests pass (green).

- [ ] Commit:

```bash
git add pipeline/requirements.txt pipeline/compute_metrics.py pipeline/test_compute_metrics.py
git commit -m "feat(pipeline): add compute_metrics with classify_tier, daily streams, velocity, growth, depth, momentum (TDD)"
```

---

## Task 4: royalties.py (TDD)

- [ ] Write `pipeline/test_royalties.py`:

```python
"""Tests for royalties.py — run with: pytest test_royalties.py -v"""
from decimal import Decimal
import pytest
from royalties import compute_weekly_royalties, compute_buyout_penalty, STREAM_RATE


# ── STREAM_RATE constant ──────────────────────────────────────────────────────

def test_stream_rate_value():
    assert STREAM_RATE == Decimal('0.035')


# ── compute_weekly_royalties ──────────────────────────────────────────────────

def test_weekly_royalties_gdd_sanity_check():
    # GDD §6.1.2: 275k streams * $0.035 * 30% = $2,887.50
    result = compute_weekly_royalties(275_000, 30.0)
    assert result == Decimal('2887.50')

def test_weekly_royalties_zero_streams():
    assert compute_weekly_royalties(0, 30.0) == Decimal('0.00')

def test_weekly_royalties_zero_split():
    assert compute_weekly_royalties(100_000, 0.0) == Decimal('0.00')

def test_weekly_royalties_full_split():
    # 100_000 * 0.035 * 1.0 = 3500.00
    result = compute_weekly_royalties(100_000, 100.0)
    assert result == Decimal('3500.00')

def test_weekly_royalties_small_streams():
    # 1000 * 0.035 * 30% = 10.50
    result = compute_weekly_royalties(1_000, 30.0)
    assert result == Decimal('10.50')

def test_weekly_royalties_returns_decimal():
    result = compute_weekly_royalties(10_000, 25.0)
    assert isinstance(result, Decimal)


# ── compute_buyout_penalty ────────────────────────────────────────────────────

def test_buyout_penalty_basic():
    # 4 weeks * $100/wk * 0.5 = $200
    result = compute_buyout_penalty(4, Decimal('100.00'))
    assert result == Decimal('200.00')

def test_buyout_penalty_zero_weeks():
    assert compute_buyout_penalty(0, Decimal('500.00')) == Decimal('0.00')

def test_buyout_penalty_zero_royalties():
    assert compute_buyout_penalty(12, Decimal('0.00')) == Decimal('0.00')

def test_buyout_penalty_returns_decimal():
    result = compute_buyout_penalty(6, Decimal('250.00'))
    assert isinstance(result, Decimal)

def test_buyout_penalty_fractional():
    # 3 weeks * $33.33 * 0.5 = $49.995 — verify rounding behaviour (no assert on exact value)
    result = compute_buyout_penalty(3, Decimal('33.33'))
    assert result == Decimal('3') * Decimal('33.33') * Decimal('0.5')
```

- [ ] Write `pipeline/royalties.py`:

```python
"""Royalty computation functions for the Roster data pipeline."""
from decimal import Decimal

STREAM_RATE = Decimal('0.035')  # $0.035/stream (10x economy compression per GDD §6.1.1)


def compute_weekly_royalties(weekly_streams: int, rev_split_label_pct: float) -> Decimal:
    """Weekly royalties earned by the label for one active contract.

    Formula: weekly_streams * $0.035 * (rev_split_label_pct / 100)

    Args:
        weekly_streams:      Sum of daily_streams_top10 for the Mon–Sun week.
        rev_split_label_pct: Label's revenue share percentage, e.g. 30.0 means 30%.
    """
    return Decimal(weekly_streams) * STREAM_RATE * (Decimal(str(rev_split_label_pct)) / Decimal('100'))


def compute_buyout_penalty(weeks_remaining: int, weekly_royalties_est: Decimal) -> Decimal:
    """Early-drop buyout penalty deducted from the label's treasury.

    Formula: weeks_remaining * weekly_royalties_est * 0.5

    Args:
        weeks_remaining:       Full weeks left in the contract term.
        weekly_royalties_est:  Most recent weekly royalties figure for the contract.
    """
    return Decimal(weeks_remaining) * weekly_royalties_est * Decimal('0.5')
```

- [ ] Run tests:

```bash
cd /Users/paulbourdon/Roster/the-roster/pipeline && pytest test_royalties.py -v
```

Expected: all tests pass.

- [ ] Commit:

```bash
git add pipeline/royalties.py pipeline/test_royalties.py
git commit -m "feat(pipeline): add royalties module with weekly royalty and buyout penalty (TDD)"
```

---

## Task 5: Rewrite pipeline/db.py

Full replacement. The old file used `artist_stats`, `market_prices`, and a single `get_all_artists` that returned only `id,spotify_id,name`. All of that is gone.

- [ ] Overwrite `pipeline/db.py` with:

```python
"""Supabase client and all database accessors for the Phase 1 pipeline."""
from __future__ import annotations

import os
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _client


# ── Artists ───────────────────────────────────────────────────────────────────

def get_all_artists() -> list[dict]:
    """Return all artists: id, spotify_id, name, tier."""
    result = get_client().table("artists").select("id,spotify_id,name,tier").execute()
    return result.data


def update_artist_tier(artist_id: str, tier: str) -> None:
    """Set artists.tier and artists.tier_updated_at to today."""
    get_client().table("artists").update({
        "tier": tier,
        "tier_updated_at": date.today().isoformat(),
    }).eq("id", artist_id).execute()


# ── scrape_raw ────────────────────────────────────────────────────────────────

def get_scrape_raw(artist_id: str, on_date: date) -> dict | None:
    """Return the scrape_raw row for (artist_id, on_date), or None."""
    result = (
        get_client()
        .table("scrape_raw")
        .select("*")
        .eq("artist_id", artist_id)
        .eq("scraped_at", on_date.isoformat())
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def insert_scrape_raw(
    artist_id: str,
    scraped_at: date,
    monthly_listeners: int,
    track_playcounts: list,
) -> None:
    """Upsert one row into scrape_raw on (artist_id, scraped_at)."""
    get_client().table("scrape_raw").upsert(
        {
            "artist_id":         artist_id,
            "scraped_at":        scraped_at.isoformat(),
            "monthly_listeners": monthly_listeners,
            "track_playcounts":  track_playcounts or None,
        },
        on_conflict="artist_id,scraped_at",
    ).execute()


def get_ml_n_days_ago(artist_id: str, n: int, before_date: date) -> int | None:
    """Return monthly_listeners from scrape_raw exactly n days before before_date."""
    target = (before_date - timedelta(days=n)).isoformat()
    result = (
        get_client()
        .table("scrape_raw")
        .select("monthly_listeners")
        .eq("artist_id", artist_id)
        .eq("scraped_at", target)
        .limit(1)
        .execute()
    )
    if result.data and result.data[0]["monthly_listeners"] is not None:
        return int(result.data[0]["monthly_listeners"])
    return None


# ── artist_stats_daily ────────────────────────────────────────────────────────

def get_daily_streams_range(
    artist_id: str,
    start_date: date,
    end_date: date,
) -> list[int]:
    """Return non-null daily_streams_top10 values for artist in [start_date, end_date]."""
    result = (
        get_client()
        .table("artist_stats_daily")
        .select("daily_streams_top10")
        .eq("artist_id", artist_id)
        .gte("date", start_date.isoformat())
        .lte("date", end_date.isoformat())
        .not_.is_("daily_streams_top10", "null")
        .execute()
    )
    return [int(row["daily_streams_top10"]) for row in result.data]


def upsert_artist_stats_daily(artist_id: str, run_date: date, row: dict) -> None:
    """Upsert one row into artist_stats_daily on (artist_id, date)."""
    payload = {"artist_id": artist_id, "date": run_date.isoformat(), **row}
    get_client().table("artist_stats_daily").upsert(
        payload, on_conflict="artist_id,date"
    ).execute()


def get_weekly_streams(artist_id: str, week_end: date) -> int:
    """Sum daily_streams_top10 for the 7 days Mon–Sun ending on week_end."""
    week_start = week_end - timedelta(days=6)
    streams = get_daily_streams_range(artist_id, week_start, week_end)
    return sum(streams)


# ── Contracts ─────────────────────────────────────────────────────────────────

def expire_contracts() -> list[str]:
    """Set status='expired' for all active contracts past their end_date.

    Returns the list of expired contract IDs.
    """
    result = (
        get_client()
        .table("contracts")
        .update({"status": "expired"})
        .eq("status", "active")
        .lte("end_date", date.today().isoformat())
        .select("id,label_id,artist_id,signing_bonus,rev_split_label_pct,"
                "royalties_earned,dev_spend_total,baseline_listeners,start_date,end_date")
        .execute()
    )
    return [row["id"] for row in result.data] if result.data else []


def get_active_contracts() -> list[dict]:
    """Return all active contracts: id, label_id, artist_id, rev_split_label_pct."""
    result = (
        get_client()
        .table("contracts")
        .select("id,label_id,artist_id,rev_split_label_pct")
        .eq("status", "active")
        .execute()
    )
    return result.data


def apply_royalties(contract_id: str, label_id: str, royalties: Decimal) -> None:
    """Add royalties to contracts.royalties_earned and labels.treasury atomically.

    Reads current values first, then writes incremented values. Not
    transactional at the DB level — acceptable for the daily cron context
    where this is the only writer.
    """
    client = get_client()

    contract_row = (
        client.table("contracts")
        .select("royalties_earned")
        .eq("id", contract_id)
        .single()
        .execute()
    ).data
    label_row = (
        client.table("labels")
        .select("treasury")
        .eq("id", label_id)
        .single()
        .execute()
    ).data

    new_earned = Decimal(str(contract_row["royalties_earned"])) + royalties
    new_treasury = Decimal(str(label_row["treasury"])) + royalties

    client.table("contracts").update(
        {"royalties_earned": str(new_earned)}
    ).eq("id", contract_id).execute()

    client.table("labels").update(
        {"treasury": str(new_treasury)}
    ).eq("id", label_id).execute()


# ── label_history ─────────────────────────────────────────────────────────────

def write_label_history(
    contract: dict,
    artist: dict,
    listeners_at_end: int | None,
    reason: str,
) -> None:
    """Insert a completed-contract row into label_history.

    net_pnl = total_royalties - signing_bonus - dev_spend_total

    Args:
        contract:        Full contracts row dict (must have id, label_id, artist_id,
                         signing_bonus, royalties_earned, dev_spend_total,
                         baseline_listeners).
        artist:          artists row dict (must have name, tier).
        listeners_at_end: Current monthly_listeners, or None if unavailable.
        reason:          'natural' or 'dropped'.
    """
    signing_bonus    = Decimal(str(contract["signing_bonus"]))
    total_royalties  = Decimal(str(contract["royalties_earned"]))
    total_dev_spend  = Decimal(str(contract.get("dev_spend_total", 0) or 0))
    net_pnl          = total_royalties - signing_bonus - total_dev_spend

    get_client().table("label_history").insert({
        "label_id":             contract["label_id"],
        "contract_id":          contract["id"],
        "artist_name":          artist["name"],
        "artist_tier":          artist["tier"],
        "listeners_at_signing": contract.get("baseline_listeners"),
        "listeners_at_end":     listeners_at_end,
        "signing_bonus":        str(signing_bonus),
        "total_royalties":      str(total_royalties),
        "total_dev_spend":      str(total_dev_spend),
        "net_pnl":              str(net_pnl),
        "reason":               reason,
        "completed_at":         date.today().isoformat(),
    }).execute()
```

- [ ] Commit:

```bash
git add pipeline/db.py
git commit -m "refactor(pipeline): rewrite db.py for phase 1 schema (scrape_raw, artist_stats_daily, contracts, labels)"
```

---

## Task 6: Rewrite pipeline/run.py + delete scorer.py

- [ ] Delete scorer.py:

```bash
git rm /Users/paulbourdon/Roster/the-roster/pipeline/scorer.py
```

- [ ] Overwrite `pipeline/run.py` with:

```python
"""Daily pipeline entry point for the Roster data pipeline.

Usage:
    python run.py                    # runs for today
    python run.py --date 2026-06-01  # runs for a specific date (backfill)
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
from decimal import Decimal

from compute_metrics import (
    classify_tier,
    compute_catalog_depth,
    compute_daily_streams,
    compute_listener_growth_28d,
    compute_momentum,
    compute_stream_velocity_7d,
)
from db import (
    apply_royalties,
    expire_contracts,
    get_active_contracts,
    get_all_artists,
    get_daily_streams_range,
    get_ml_n_days_ago,
    get_scrape_raw,
    update_artist_tier,
    upsert_artist_stats_daily,
    write_label_history,
    get_client,
)
from royalties import compute_weekly_royalties


def run(run_date: date = None) -> int:
    """Run the daily pipeline for run_date (defaults to today).

    Returns the number of artists processed.
    """
    if run_date is None:
        run_date = date.today()

    artists = get_all_artists()
    if not artists:
        print("No artists found in database — exiting.")
        return 0

    processed = 0

    for artist in artists:
        artist_id = artist["id"]
        name = artist["name"]

        today_row = get_scrape_raw(artist_id, run_date)
        if today_row is None:
            print(f"  SKIP {name}: no scrape_raw for {run_date}")
            continue

        ml = today_row.get("monthly_listeners")
        today_tracks = today_row.get("track_playcounts") or []

        # Daily stream delta
        yesterday_row = get_scrape_raw(artist_id, run_date - timedelta(days=1))
        yesterday_tracks = (yesterday_row.get("track_playcounts") or []) if yesterday_row else []
        daily_streams = compute_daily_streams(today_tracks, yesterday_tracks)

        # 7-day stream velocity
        streams_last_7 = sum(
            get_daily_streams_range(artist_id, run_date - timedelta(days=6), run_date)
        )
        streams_prev_7 = sum(
            get_daily_streams_range(artist_id, run_date - timedelta(days=13), run_date - timedelta(days=7))
        )
        velocity = compute_stream_velocity_7d(streams_last_7, streams_prev_7)

        # 28-day listener growth
        ml_28d = get_ml_n_days_ago(artist_id, 28, run_date)
        growth = compute_listener_growth_28d(ml, ml_28d) if (ml is not None and ml_28d is not None) else None

        # Catalog depth
        depth = compute_catalog_depth(today_tracks) if today_tracks else None

        # Momentum score
        momentum = compute_momentum(velocity, growth, depth)

        # Upsert artist_stats_daily
        upsert_artist_stats_daily(artist_id, run_date, {
            "monthly_listeners":   ml,
            "daily_streams_top10": daily_streams,
            "stream_velocity_7d":  velocity,
            "listener_growth_28d": growth,
            "catalog_depth_score": depth,
            "momentum_score":      momentum,
        })

        # Tier classification and update if changed
        if ml is not None:
            new_tier = classify_tier(ml)
            if new_tier != artist.get("tier"):
                update_artist_tier(artist_id, new_tier)
                print(f"  TIER {name}: {artist.get('tier')} -> {new_tier}")

        processed += 1
        print(f"  OK  {name} (ml={ml}, streams={daily_streams}, momentum={momentum})")

    # Contract expiry check (runs daily after metrics)
    expired_ids = expire_contracts()
    if expired_ids:
        client = get_client()
        for contract_id in expired_ids:
            contract_row = (
                client.table("contracts")
                .select("*")
                .eq("id", contract_id)
                .single()
                .execute()
            ).data
            artist_row = (
                client.table("artists")
                .select("id,name,tier")
                .eq("id", contract_row["artist_id"])
                .single()
                .execute()
            ).data
            latest_scrape = get_scrape_raw(contract_row["artist_id"], run_date)
            listeners_at_end = (
                int(latest_scrape["monthly_listeners"])
                if latest_scrape and latest_scrape.get("monthly_listeners") is not None
                else None
            )
            write_label_history(contract_row, artist_row, listeners_at_end, reason="natural")
            print(f"  EXPIRED contract {contract_id} for {artist_row['name']}")

    # Sunday royalty run
    if run_date.weekday() == 6:
        run_royalties(run_date)

    return processed


def run_royalties(week_end: date) -> None:
    """Compute and apply weekly royalties for all active contracts.

    week_end must be a Sunday (weekday() == 6).
    """
    contracts = get_active_contracts()
    print(f"  ROYALTIES: processing {len(contracts)} active contracts for week ending {week_end}")

    for contract in contracts:
        artist_id = contract["artist_id"]
        label_id  = contract["label_id"]
        contract_id = contract["id"]
        rev_split = float(contract["rev_split_label_pct"])

        weekly_streams = sum(
            get_daily_streams_range(artist_id, week_end - timedelta(days=6), week_end)
        )
        royalties = compute_weekly_royalties(weekly_streams, rev_split)

        if royalties > Decimal('0'):
            apply_royalties(contract_id, label_id, royalties)
            print(f"    contract {contract_id}: {weekly_streams} streams -> ${royalties}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Roster daily pipeline.")
    parser.add_argument("--date", help="ISO date to run for (default: today)", default=None)
    args = parser.parse_args()

    run_date = date.fromisoformat(args.date) if args.date else None
    count = run(run_date)
    print(f"\nDone. Processed {count} artists.")
```

- [ ] Commit:

```bash
git add pipeline/run.py
git commit -m "refactor(pipeline): rewrite run.py for phase 1 loop (scrape_raw -> metrics -> contracts -> royalties)"
```

---

## Task 7: TypeScript types + root redirect

- [ ] Create `src/lib/types.ts`:

```typescript
// Shared TypeScript types for the Roster Phase 1 data model.
// All field names match Supabase column names exactly.

export type Tier = 'underground' | 'emerging' | 'rising' | 'established' | 'major'

export type ContractStatus = 'active' | 'expired' | 'dropped'

export interface Label {
  id: string
  label_name: string
  genre_1: string | null
  genre_2: string | null
  country: string | null
  treasury: number
  created_at: string
}

export interface Artist {
  id: string
  spotify_id: string
  name: string
  genre: string | null
  country: string | null
  tier: Tier
  tier_updated_at: string | null
}

export interface ArtistStats {
  artist_id: string
  date: string
  monthly_listeners: number | null
  daily_streams_top10: number | null
  stream_velocity_7d: number | null
  listener_growth_28d: number | null
  catalog_depth_score: number | null
  momentum_score: number | null
}

export interface Contract {
  id: string
  label_id: string
  artist_id: string
  status: ContractStatus
  signing_bonus: number
  rev_split_label_pct: number
  term_months: 3 | 6 | 12
  start_date: string
  end_date: string
  baseline_listeners: number | null
  baseline_growth_pct: number | null
  royalties_earned: number
  dev_spend_total: number
  created_at: string
}

export interface LabelHistory {
  id: string
  label_id: string
  contract_id: string
  artist_name: string
  artist_tier: Tier
  listeners_at_signing: number | null
  listeners_at_end: number | null
  signing_bonus: number
  total_royalties: number
  total_dev_spend: number
  net_pnl: number
  reason: 'natural' | 'dropped'
  completed_at: string
}
```

- [ ] Read `src/app/page.tsx` to confirm the current redirect target, then update it from `/market` to `/dashboard`.

The change: find the `redirect('/market')` call and replace with `redirect('/dashboard')`.

- [ ] Commit:

```bash
git add src/lib/types.ts src/app/page.tsx
git commit -m "feat(web): add TypeScript types and update root redirect to /dashboard"
```

---

## Task 8: Middleware + layout update

- [ ] Create `src/middleware.ts`. The session-refresh block is copied verbatim from `src/lib/supabase/middleware.ts`'s `updateSession` — do NOT import that function, inline the client setup directly so middleware has no module dependency beyond `@supabase/ssr` and `next/server`.

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not add logic between createServerClient and getUser()
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // No user → redirect to /login (except public routes)
  if (!user && !PUBLIC_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated user on /login or /signup → redirect to /dashboard
  if (user && PUBLIC_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Authenticated user not on /onboarding → check if label exists
  if (user && pathname !== '/onboarding') {
    const { data: label } = await supabase
      .from('labels')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!label) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
```

- [ ] Update `src/app/(game)/layout.tsx`: replace the existing `NAV_ITEMS` array and the two `slice` render calls with:

Old `NAV_ITEMS` and nav block:
```tsx
const NAV_ITEMS = [
  { icon: '◼', label: 'LABEL HQ',    href: '/dashboard' },
  { icon: '◆', label: 'ROSTER',      href: '/market' },
  { icon: '✦', label: 'SCOUT',       href: '/scout' },
  { icon: '$', label: 'A&R LAB',     href: '/anr' },
  { icon: '▲', label: 'MINI LEAGUE', href: '/league' },
  { icon: '◉', label: 'WEEKLY OBJ.', href: '/portfolio' },
]
```

New `NAV_ITEMS`:
```tsx
const NAV_ITEMS = [
  { icon: '◼', label: 'LABEL HQ',  href: '/dashboard' },
  { icon: '◆', label: 'SEARCH',    href: '/search' },
  { icon: '$', label: 'CONTRACTS', href: '/contracts' },
  { icon: '◉', label: 'HISTORY',   href: '/history' },
]
```

Old nav render:
```tsx
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, padding: '8px 16px' }}>OFFICE</div>
{NAV_ITEMS.slice(0, 4).map(item => <SideItem key={item.href} {...item}/>)}
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, padding: '12px 16px 8px' }}>COMPETE</div>
{NAV_ITEMS.slice(4).map(item => <SideItem key={item.href} {...item}/>)}
```

New nav render (remove section labels, render all 4 items in one block):
```tsx
{NAV_ITEMS.map(item => <SideItem key={item.href} {...item}/>)}
```

- [ ] Commit:

```bash
git add src/middleware.ts src/app/(game)/layout.tsx
git commit -m "feat(web): add auth middleware with onboarding guard and update nav to 4 items"
```

---

## Task 9: Labels API

- [ ] Create `src/app/api/labels/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { label_name } = body ?? {}
  if (!label_name?.trim()) {
    return Response.json({ error: 'label_name required' }, { status: 400 })
  }

  // Idempotency check: one label per user
  const { data: existing } = await supabase
    .from('labels')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (existing) {
    return Response.json({ error: 'Label already exists' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('labels')
    .insert({ id: user.id, label_name: label_name.trim() })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
```

- [ ] Create `src/app/api/labels/me/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Label not found' }, { status: 404 })
  return Response.json(data)
}

const ALLOWED_PATCH_FIELDS = ['genre_1', 'genre_2', 'country', 'label_name'] as const
type PatchField = (typeof ALLOWED_PATCH_FIELDS)[number]

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Whitelist: only accept known fields
  const update: Partial<Record<PatchField, string>> = {}
  for (const field of ALLOWED_PATCH_FIELDS) {
    if (field in body) {
      update[field] = body[field]
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('labels')
    .update(update)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
```

- [ ] Verification (run in browser devtools after logging in, or via Supabase dashboard):

```bash
# Check the labels table after creating a label via onboarding:
# SELECT * FROM labels;
#
# Manual curl test (replace TOKEN with a real Supabase auth JWT):
# curl -X POST http://localhost:3000/api/labels \
#   -H "Content-Type: application/json" \
#   -H "Cookie: <auth-cookie>" \
#   -d '{"label_name": "Test Label"}'
# Expected: 201 with the new labels row
#
# curl http://localhost:3000/api/labels/me \
#   -H "Cookie: <auth-cookie>"
# Expected: 200 with label JSON
```

- [ ] Commit:

```bash
git add src/app/api/labels/route.ts src/app/api/labels/me/route.ts
git commit -m "feat(web): add /api/labels POST and /api/labels/me GET+PATCH route handlers"
```
### Task 10: Artists search + on-ramps API

**Files:**
- Create: `src/app/api/artists/search/route.ts`
- Create: `src/app/api/artists/on-ramps/route.ts`

Steps:

- [ ] Step 1: Write `src/app/api/artists/search/route.ts`

```ts
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return Response.json({ artists: [] })

  const { data, error } = await supabase
    .from('artists')
    .select('id, spotify_id, name, genre, country, tier')
    .ilike('name', `%${q}%`)
    .neq('tier', 'major')
    .limit(20)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ artists: data ?? [] })
}
```

- [ ] Step 2: Write `src/app/api/artists/on-ramps/route.ts`

Use separate queries (no complex joins) for reliability:
1. Get label genres + country
2. Breaking: query `artist_stats_daily` today ordered by `stream_velocity_7d DESC` limit 5 → get artist ids → query `artists`
3. Genre picks: query `artists` with `.or()` for genre ilike matches → get ids → query `artist_stats_daily` for those ids ordered by `momentum_score DESC` limit 3 → re-query `artists` in that order
4. Regional: same pattern with `eq('country', label.country)`

```ts
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)

  const { data: label } = await supabase
    .from('labels')
    .select('genre_1, genre_2, country')
    .eq('id', user.id)
    .single()

  // Breaking: top 5 by stream_velocity_7d today
  const { data: bStats } = await supabase
    .from('artist_stats_daily')
    .select('artist_id, stream_velocity_7d')
    .eq('date', today)
    .not('stream_velocity_7d', 'is', null)
    .order('stream_velocity_7d', { ascending: false })
    .limit(5)

  const bIds = (bStats ?? []).map(s => s.artist_id)
  const breakingVelocityMap = Object.fromEntries(
    (bStats ?? []).map(s => [s.artist_id, s.stream_velocity_7d])
  )
  const { data: breakingArtists } = bIds.length
    ? await supabase.from('artists').select('*').in('id', bIds)
    : { data: [] }

  // Genre picks: top 3 by momentum_score for label genres
  let genreArtists: unknown[] = []
  let genreScoreMap: Record<string, number> = {}
  if (label?.genre_1) {
    const genres = [label.genre_1, label.genre_2].filter(Boolean) as string[]
    const orFilter = genres.map(g => `genre.ilike.%${g}%`).join(',')
    const { data: gArtists } = await supabase
      .from('artists')
      .select('id')
      .or(orFilter)
    if (gArtists?.length) {
      const { data: gStats } = await supabase
        .from('artist_stats_daily')
        .select('artist_id, momentum_score')
        .eq('date', today)
        .in('artist_id', gArtists.map(a => a.id))
        .not('momentum_score', 'is', null)
        .order('momentum_score', { ascending: false })
        .limit(3)
      if (gStats?.length) {
        genreScoreMap = Object.fromEntries(gStats.map(s => [s.artist_id, s.momentum_score]))
        const { data: ga } = await supabase
          .from('artists')
          .select('*')
          .in('id', gStats.map(s => s.artist_id))
        genreArtists = ga ?? []
      }
    }
  }

  // Regional: top 5 by stream_velocity_7d in same country
  let regionalArtists: unknown[] = []
  let regionalVelocityMap: Record<string, number> = {}
  if (label?.country) {
    const { data: rArtists } = await supabase
      .from('artists')
      .select('id')
      .eq('country', label.country)
    if (rArtists?.length) {
      const { data: rStats } = await supabase
        .from('artist_stats_daily')
        .select('artist_id, stream_velocity_7d')
        .eq('date', today)
        .in('artist_id', rArtists.map(a => a.id))
        .not('stream_velocity_7d', 'is', null)
        .order('stream_velocity_7d', { ascending: false })
        .limit(5)
      if (rStats?.length) {
        regionalVelocityMap = Object.fromEntries(rStats.map(s => [s.artist_id, s.stream_velocity_7d]))
        const { data: ra } = await supabase
          .from('artists')
          .select('*')
          .in('id', rStats.map(s => s.artist_id))
        regionalArtists = ra ?? []
      }
    }
  }

  return Response.json({
    breaking: breakingArtists ?? [],
    breakingVelocityMap,
    genrePicks: genreArtists,
    genreScoreMap,
    regional: regionalArtists,
    regionalVelocityMap,
  })
}
```

- [ ] Step 3: Verify
```bash
# After npm run dev, with a valid session cookie:
curl -b cookies.txt 'http://localhost:3000/api/artists/search?q=doja'
curl -b cookies.txt 'http://localhost:3000/api/artists/on-ramps'
# Expected: JSON with artists array / breaking+genrePicks+regional arrays
```

- [ ] Step 4: Commit
```bash
git add src/app/api/artists/search/route.ts src/app/api/artists/on-ramps/route.ts
git commit -m "feat(web): add artist search and on-ramps API routes"
```

---

### Task 11: Artist profile API

**Files:**
- Create: `src/app/api/artists/[spotifyId]/route.ts`

Steps:

- [ ] Step 1: Write the file. Complete implementation:

```ts
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ spotifyId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { spotifyId } = await params

  const { data: artist, error: aErr } = await supabase
    .from('artists')
    .select('*')
    .eq('spotify_id', spotifyId)
    .single()

  if (aErr || !artist) return Response.json({ error: 'Not found' }, { status: 404 })

  const [statsRes, sparkRes, countRes] = await Promise.all([
    supabase.from('artist_stats_daily').select('*').eq('artist_id', artist.id)
      .order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('artist_stats_daily').select('date, daily_streams_top10')
      .eq('artist_id', artist.id).order('date', { ascending: false }).limit(7),
    supabase.from('contracts').select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id).eq('status', 'active'),
  ])

  const stats = statsRes.data ? { ...statsRes.data } : null

  if (stats && artist.tier === 'underground') {
    delete (stats as Record<string, unknown>).momentum_score
    return Response.json({
      artist, stats, spark: sparkRes.data ?? [],
      signedByCount: countRes.count ?? 0,
      underground_signal: true,
    })
  }

  return Response.json({
    artist, stats, spark: sparkRes.data ?? [],
    signedByCount: countRes.count ?? 0,
  })
}
```

- [ ] Step 2: Verify
```bash
curl -b cookies.txt 'http://localhost:3000/api/artists/[spotifyId]'
# Replace [spotifyId] with a real Spotify ID from your artists table
# Expected: { artist: {...}, stats: {...}, spark: [...], signedByCount: N }
```

- [ ] Step 3: Commit
```bash
git add src/app/api/artists/[spotifyId]/route.ts
git commit -m "feat(web): add artist profile API route"
```

---

### Task 12: Contracts API

**Files:**
- Create: `src/app/api/contracts/route.ts`
- Create: `src/app/api/contracts/[id]/route.ts`
- Create: `src/app/api/contracts/[id]/release/route.ts`

Steps:

- [ ] Step 1: Write `src/app/api/contracts/route.ts` (GET + POST)

```ts
import { createClient } from '@/lib/supabase/server'

const BONUS_RANGES: Record<string, [number, number]> = {
  underground: [500, 2_000],
  emerging: [5_000, 20_000],
  rising: [20_000, 80_000],
  established: [80_000, 300_000],
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('contracts')
    .select('*, artists(name, tier, spotify_id)')
    .eq('label_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ contracts: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { artist_id, signing_bonus, rev_split_label_pct, term_months } = body

  // Validate inputs
  if (![3, 6, 12].includes(term_months))
    return Response.json({ error: 'term_months must be 3, 6, or 12' }, { status: 400 })
  if (rev_split_label_pct < 10 || rev_split_label_pct > 50)
    return Response.json({ error: 'rev_split_label_pct must be 10-50' }, { status: 400 })
  if (typeof signing_bonus !== 'number' || signing_bonus <= 0)
    return Response.json({ error: 'signing_bonus must be a positive number' }, { status: 400 })

  // Check active contract count < 5
  const { count: activeCount } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .eq('label_id', user.id)
    .eq('status', 'active')
  if ((activeCount ?? 0) >= 5)
    return Response.json({ error: 'Roster full - maximum 5 active contracts' }, { status: 409 })

  // Check treasury
  const { data: label } = await supabase
    .from('labels')
    .select('treasury')
    .eq('id', user.id)
    .single()
  if (!label || label.treasury < signing_bonus)
    return Response.json({ error: 'Insufficient treasury' }, { status: 402 })

  // Fetch artist, validate tier + bonus range
  const { data: artist } = await supabase
    .from('artists')
    .select('id, tier, name')
    .eq('id', artist_id)
    .single()
  if (!artist) return Response.json({ error: 'Artist not found' }, { status: 404 })
  if (artist.tier === 'major')
    return Response.json({ error: 'Major artists are not signable' }, { status: 400 })

  const range = BONUS_RANGES[artist.tier]
  if (range && (signing_bonus < range[0] || signing_bonus > range[1]))
    return Response.json({ error: `Signing bonus out of range for ${artist.tier} (${range[0]}-${range[1]})` }, { status: 400 })

  // Fetch latest stats for baseline
  const { data: latestStats } = await supabase
    .from('artist_stats_daily')
    .select('monthly_listeners, listener_growth_28d')
    .eq('artist_id', artist_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  const endDate = new Date(Date.now() + term_months * 30 * 86400 * 1000).toISOString().slice(0, 10)

  // Insert contract
  const { data: contract, error: insertErr } = await supabase
    .from('contracts')
    .insert({
      label_id: user.id,
      artist_id,
      signing_bonus,
      rev_split_label_pct,
      term_months,
      start_date: today,
      end_date: endDate,
      baseline_listeners: latestStats?.monthly_listeners ?? null,
      baseline_growth_pct: latestStats?.listener_growth_28d ?? null,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  // Deduct signing bonus from treasury
  const { error: treasuryErr } = await supabase
    .from('labels')
    .update({ treasury: label.treasury - signing_bonus })
    .eq('id', user.id)

  if (treasuryErr) {
    // Roll back contract
    await supabase.from('contracts').delete().eq('id', contract.id)
    return Response.json({ error: 'Treasury update failed - contract rolled back' }, { status: 500 })
  }

  return Response.json(contract, { status: 201 })
}
```

- [ ] Step 2: Write `src/app/api/contracts/[id]/route.ts` (DELETE = drop)

```ts
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .eq('label_id', user.id)
    .single()

  if (!contract) return Response.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status !== 'active')
    return Response.json({ error: 'Can only drop active contracts' }, { status: 400 })

  // Compute buyout penalty
  const weeksRemaining = Math.max(
    0,
    Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (7 * 86400_000))
  )
  const weeksElapsed = Math.max(
    1,
    Math.ceil((Date.now() - new Date(contract.start_date).getTime()) / (7 * 86400_000))
  )
  const weeklyEst = contract.royalties_earned / weeksElapsed
  const penalty = Math.round(weeksRemaining * weeklyEst * 0.5 * 100) / 100

  // Check treasury covers penalty
  const { data: label } = await supabase
    .from('labels')
    .select('treasury')
    .eq('id', user.id)
    .single()

  if (!label || label.treasury < penalty)
    return Response.json({ error: 'Insufficient treasury for buyout penalty', penalty }, { status: 409 })

  // Fetch artist + latest stats for history row
  const { data: artist } = await supabase
    .from('artists')
    .select('name, tier')
    .eq('id', contract.artist_id)
    .single()

  const { data: latestStats } = await supabase
    .from('artist_stats_daily')
    .select('monthly_listeners')
    .eq('artist_id', contract.artist_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  const netPnl = contract.royalties_earned - contract.signing_bonus - contract.dev_spend_total

  await supabase.from('contracts').update({ status: 'dropped' }).eq('id', id)
  await supabase.from('labels').update({ treasury: label.treasury - penalty }).eq('id', user.id)
  await supabase.from('label_history').insert({
    label_id: user.id,
    contract_id: id,
    artist_name: artist?.name ?? '',
    artist_tier: artist?.tier ?? '',
    listeners_at_signing: contract.baseline_listeners,
    listeners_at_end: latestStats?.monthly_listeners ?? null,
    signing_bonus: contract.signing_bonus,
    total_royalties: contract.royalties_earned,
    total_dev_spend: contract.dev_spend_total,
    net_pnl: netPnl,
    reason: 'dropped',
    completed_at: today,
  })

  return Response.json({ ok: true, penalty })
}
```

- [ ] Step 3: Write `src/app/api/contracts/[id]/release/route.ts` (POST = release expired)

```ts
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .eq('label_id', user.id)
    .single()

  if (!contract) return Response.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status !== 'expired')
    return Response.json({ error: 'Can only release expired contracts' }, { status: 400 })

  const { data: artist } = await supabase
    .from('artists')
    .select('name, tier')
    .eq('id', contract.artist_id)
    .single()

  const { data: latestStats } = await supabase
    .from('artist_stats_daily')
    .select('monthly_listeners')
    .eq('artist_id', contract.artist_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  const netPnl = contract.royalties_earned - contract.signing_bonus - contract.dev_spend_total

  await supabase.from('label_history').insert({
    label_id: user.id,
    contract_id: id,
    artist_name: artist?.name ?? '',
    artist_tier: artist?.tier ?? '',
    listeners_at_signing: contract.baseline_listeners,
    listeners_at_end: latestStats?.monthly_listeners ?? null,
    signing_bonus: contract.signing_bonus,
    total_royalties: contract.royalties_earned,
    total_dev_spend: contract.dev_spend_total,
    net_pnl: netPnl,
    reason: 'natural',
    completed_at: today,
  })

  return Response.json({ ok: true })
}
```

- [ ] Step 4: Verify
```bash
# Sign an artist:
curl -b cookies.txt -X POST http://localhost:3000/api/contracts \
  -H 'Content-Type: application/json' \
  -d '{"artist_id":"<uuid>","signing_bonus":12500,"rev_split_label_pct":30,"term_months":6}'
# Expected: 201 with contract object

# List contracts:
curl -b cookies.txt http://localhost:3000/api/contracts
# Expected: { contracts: [...] }
```

- [ ] Step 5: Commit
```bash
git add src/app/api/contracts/route.ts src/app/api/contracts/[id]/route.ts src/app/api/contracts/[id]/release/route.ts
git commit -m "feat(web): add contracts API routes (sign, list, drop, release)"
```

---

### Task 13: Royalties weekly cron API

**Files:**
- Create: `src/app/api/royalties/weekly/route.ts`

Steps:

- [ ] Step 1: Write the complete file

```ts
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const weekStart = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10)

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, label_id, artist_id, rev_split_label_pct')
    .eq('status', 'active')

  if (!contracts?.length) return Response.json({ processed: 0, date: today })

  let processed = 0
  for (const c of contracts) {
    const { data: rows } = await supabase
      .from('artist_stats_daily')
      .select('daily_streams_top10')
      .eq('artist_id', c.artist_id)
      .gte('date', weekStart)
      .lte('date', today)
      .not('daily_streams_top10', 'is', null)

    const weeklyStreams = (rows ?? []).reduce((s, r) => s + (r.daily_streams_top10 ?? 0), 0)
    if (weeklyStreams === 0) continue

    const royalties = Math.round(weeklyStreams * 0.035 * (c.rev_split_label_pct / 100) * 100) / 100

    const [{ data: contract }, { data: label }] = await Promise.all([
      supabase.from('contracts').select('royalties_earned').eq('id', c.id).single(),
      supabase.from('labels').select('treasury').eq('id', c.label_id).single(),
    ])

    await Promise.all([
      supabase.from('contracts').update({ royalties_earned: (contract?.royalties_earned ?? 0) + royalties }).eq('id', c.id),
      supabase.from('labels').update({ treasury: (label?.treasury ?? 0) + royalties }).eq('id', c.label_id),
    ])
    processed++
  }

  return Response.json({ processed, date: today })
}
```

- [ ] Step 2: Add `CRON_SECRET` to `.env.local` (any random string for local dev):
```bash
echo "CRON_SECRET=dev-secret-change-in-prod" >> .env.local
```

- [ ] Step 3: Verify
```bash
curl -X POST -H "Authorization: Bearer dev-secret-change-in-prod" \
  http://localhost:3000/api/royalties/weekly
# Expected: { processed: N, date: "YYYY-MM-DD" }
```

- [ ] Step 4: Commit
```bash
git add src/app/api/royalties/weekly/route.ts .env.local
git commit -m "feat(web): add weekly royalties cron endpoint"
```

---

### Task 14: Onboarding page

**Files:**
- Create: `src/app/onboarding/page.tsx`

Steps:

- [ ] Step 1: Write the complete file. This is a client component (`'use client'`) with 3 steps.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const GENRES = ['Afrobeats', 'Hip-Hop', 'Indie', 'Electronic', 'Pop', 'R&B / Soul', 'Latin', 'K-Pop', 'Rock']
const SEL_COLORS = ['var(--lime)', 'var(--cyan)'] as const
const SEL_BG = ['rgba(200,255,58,0.1)', 'rgba(62,224,255,0.08)'] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [labelName, setLabelName] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submitStep1() {
    if (!labelName.trim()) return
    setLoading(true); setError('')
    const res = await fetch('/api/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label_name: labelName.trim() }),
    })
    if (!res.ok) { setError((await res.json()).error ?? 'Error'); setLoading(false); return }
    setStep(2); setLoading(false)
  }

  async function submitStep2() {
    if (!genres.length) return
    setLoading(true)
    await fetch('/api/labels/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre_1: genres[0] ?? null, genre_2: genres[1] ?? null }),
    })
    setStep(3); setLoading(false)
  }

  function toggleGenre(g: string) {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : prev.length < 2 ? [...prev, g] : prev)
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
    border: `2px solid var(--lime)`, color: 'var(--lime)', background: 'rgba(200,255,58,0.08)',
    cursor: active ? 'pointer' : 'not-allowed', letterSpacing: 1,
    opacity: active ? 1 : 0.35,
  })

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Pixelify Sans', monospace",
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo + progress */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="display" style={{ fontSize: 42, color: 'var(--lime)', letterSpacing: 4 }}>ROSTER</div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 4 }}>STEP {step} OF 3</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 3, width: 40, background: i <= step ? 'var(--lime)' : 'var(--bg-tile)' }} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div>
            <div className="tag" style={{ color: 'var(--ink-low)', marginBottom: 8, fontSize: 9 }}>WHAT IS YOUR LABEL CALLED?</div>
            <input
              value={labelName}
              onChange={e => setLabelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitStep1()}
              placeholder="LABEL NAME"
              autoFocus
              style={{
                width: '100%', background: 'var(--bg-panel)', border: '2px solid var(--line)',
                color: 'var(--ink-hi)', fontFamily: 'Jersey 25, monospace', fontSize: 28,
                padding: '10px 14px', outline: 'none', letterSpacing: 2,
              }}
            />
            {error && <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginTop: 6 }}>{error}</div>}
            <button onClick={submitStep1} disabled={!labelName.trim() || loading} style={btnStyle(!!labelName.trim() && !loading)}>
              {loading ? 'SAVING...' : 'CONTINUE'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="tag" style={{ color: 'var(--ink-low)', marginBottom: 4, fontSize: 9 }}>WHAT MUSIC DO YOU KNOW?</div>
            <div style={{ color: 'var(--ink-mid)', fontSize: 11, marginBottom: 12 }}>Pick 1 or 2 genres</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 12 }}>
              {GENRES.map(g => {
                const idx = genres.indexOf(g)
                const sel = idx !== -1
                return (
                  <div
                    key={g}
                    onClick={() => toggleGenre(g)}
                    style={{
                      background: sel ? SEL_BG[idx] : 'var(--bg-panel)',
                      border: `${sel ? 2 : 1}px solid ${sel ? SEL_COLORS[idx] : 'var(--line)'}`,
                      padding: '10px 6px', textAlign: 'center', cursor: 'pointer',
                    }}
                  >
                    <div className="tag" style={{ color: sel ? SEL_COLORS[idx] : 'var(--ink-mid)', fontSize: 8 }}>{g}</div>
                  </div>
                )
              })}
            </div>
            {genres.length > 0 && (
              <div style={{
                background: 'var(--bg-panel)', border: '1px solid var(--line)',
                padding: '7px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>selected:</span>
                {genres.map((g, i) => (
                  <span key={g} className="tag" style={{ color: SEL_COLORS[i], border: `1px solid ${SEL_COLORS[i]}`, padding: '2px 6px', fontSize: 8 }}>{g}</span>
                ))}
              </div>
            )}
            <button onClick={submitStep2} disabled={!genres.length || loading} style={btnStyle(genres.length > 0 && !loading)}>
              {loading ? 'SAVING...' : 'CONTINUE'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="tag" style={{ color: 'var(--ink-low)', marginBottom: 12, fontSize: 9 }}>YOUR FIRST SIGNING?</div>
            <div style={{ color: 'var(--ink-mid)', fontSize: 12, marginBottom: 16 }}>Head to Search to find artists and make your first offer.</div>
            <button
              onClick={() => router.push('/search')}
              style={{ ...btnStyle(true), marginBottom: 8 }}
            >
              GO TO SEARCH
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                width: '100%', fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
                border: '1px solid var(--line)', color: 'var(--ink-mid)', background: 'transparent',
                cursor: 'pointer', letterSpacing: 1,
              }}
            >
              SKIP FOR NOW
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] Step 2: Verify (start dev server, sign up, check redirect to /onboarding, complete all 3 steps, confirm redirect to /dashboard or /search)
```bash
cd the-roster && npm run dev
# Open http://localhost:3000 -- unauthenticated -> /login
# Sign up -> /onboarding (step 1)
# Complete 3 steps -> /dashboard or /search
```

- [ ] Step 3: Commit
```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(web): add 3-step onboarding page"
```

---

### Task 15: Dashboard page

**Files:**
- Modify: `src/app/(game)/dashboard/page.tsx` (full replacement)

Steps:

- [ ] Step 1: Replace the entire file with the following complete implementation. The existing file queries `artist_stats`, `market_prices`, and `artists.image_url` -- all of which are dropped in Phase 1. The replacement queries `labels` and `contracts` with the new schema.

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Label, Contract } from '@/lib/types'

type ContractRow = Contract & { artists: { name: string; tier: string; spotify_id: string } }

async function getDashboardData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [labelRes, contractsRes] = await Promise.all([
    supabase.from('labels').select('*').eq('id', user.id).single(),
    supabase.from('contracts')
      .select('*, artists(name, tier, spotify_id)')
      .eq('label_id', user.id)
      .order('created_at', { ascending: false }),
  ])
  return { label: labelRes.data as Label, contracts: (contractsRes.data ?? []) as ContractRow[] }
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function weeksLeft(endDate: string) {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (7 * 86_400_000)))
}

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  if (!data) return null
  const { label, contracts } = data
  const active = contracts.filter(c => c.status === 'active')
  const expired = contracts.filter(c => c.status === 'expired')

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>LABEL HQ</div>
          <div className="display" style={{ fontSize: 36, color: 'var(--ink-hi)', lineHeight: 0.9 }}>{label.label_name}</div>
        </div>
        <Link href="/search" style={{
          fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '8px 16px',
          border: '2px solid var(--lime)', color: 'var(--lime)',
          background: 'rgba(200,255,58,0.08)', textDecoration: 'none', letterSpacing: 1,
        }}>+ SIGN ARTIST</Link>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 16 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>TREASURY</div>
          <div className="display" style={{ fontSize: 42, color: 'var(--amber)', lineHeight: 1, marginTop: 4 }}>{fmtUSD(label.treasury)}</div>
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 16 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROYALTIES EARNED</div>
          {active.length === 0
            ? <div style={{ color: 'var(--ink-mid)', fontSize: 12, marginTop: 8 }}>Sign your first artist to start earning</div>
            : <div className="display" style={{ fontSize: 42, color: 'var(--lime)', lineHeight: 1, marginTop: 4 }}>
                {fmtUSD(active.reduce((s, c) => s + c.royalties_earned, 0))}
              </div>
          }
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 16 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROSTER</div>
          <div className="display" style={{ fontSize: 42, color: active.length >= 5 ? 'var(--rose)' : 'var(--cyan)', lineHeight: 1, marginTop: 4 }}>
            {active.length} / 5
          </div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 4 }}>
            {active.length >= 5 ? 'ROSTER FULL' : `${5 - active.length} SLOTS OPEN`}
          </div>
        </div>
      </div>

      {/* Expired banner */}
      {expired.length > 0 && (
        <div style={{ background: 'rgba(255,84,120,0.06)', border: '2px solid var(--rose)', padding: '12px 16px', marginBottom: 16 }}>
          <div className="tag" style={{ color: 'var(--rose)', fontSize: 10, marginBottom: 10 }}>
            {expired.length} CONTRACT{expired.length > 1 ? 'S' : ''} EXPIRED
          </div>
          {expired.map(c => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0', borderTop: '1px solid rgba(255,84,120,0.2)',
            }}>
              <div>
                <span style={{ color: 'var(--ink-hi)', fontSize: 13 }}>{c.artists.name}</span>
                <span className="tag" style={{ color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 8, marginLeft: 8, border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 4px' }}>
                  {c.artists.tier.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={`/artist/${c.artists.spotify_id}`} style={{
                  fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
                  border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
                }}>RE-SIGN</Link>
                <Link href="/contracts" style={{
                  fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
                  border: '1px solid var(--rose)', color: 'var(--rose)', textDecoration: 'none',
                }}>RELEASE</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active roster */}
      <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
        <div style={{ padding: '8px 16px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>ACTIVE ROSTER</span>
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{active.length} ARTISTS</span>
        </div>
        {active.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: 'var(--ink-mid)', fontSize: 13, marginBottom: 16 }}>Your roster is empty</div>
            <Link href="/search" style={{
              fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px 20px',
              border: '2px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
            }}>SIGN YOUR FIRST ARTIST</Link>
          </div>
        ) : active.map(c => {
          const wl = weeksLeft(c.end_date)
          const netPnl = c.royalties_earned - c.signing_bonus - c.dev_spend_total
          return (
            <div key={c.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px 80px auto',
              gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line-soft)',
              alignItems: 'center',
            }}>
              <div>
                <Link href={`/artist/${c.artists.spotify_id}`} style={{ color: 'var(--ink-hi)', textDecoration: 'none', fontSize: 14 }}>
                  {c.artists.name}
                </Link>
                <div style={{ marginTop: 3 }}>
                  <span className="tag" style={{
                    color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 8,
                    border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 4px',
                  }}>{c.artists.tier.toUpperCase()}</span>
                </div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>WEEKS LEFT</div>
                <div className="tag" style={{ color: wl <= 2 ? 'var(--rose)' : 'var(--ink-hi)', fontSize: 13, marginTop: 2 }}>{wl}</div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>ROYALTIES</div>
                <div className="tag" style={{ color: 'var(--lime)', fontSize: 13, marginTop: 2 }}>{fmtUSD(c.royalties_earned)}</div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>NET P&L</div>
                <div className="tag" style={{ color: netPnl >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 13, marginTop: 2 }}>{netPnl >= 0 ? '+' : ''}{fmtUSD(netPnl)}</div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>SPLIT</div>
                <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 13, marginTop: 2 }}>{c.rev_split_label_pct}%</div>
              </div>
              <Link href="/contracts" style={{
                fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '5px 10px',
                border: '1px solid var(--line)', color: 'var(--ink-mid)', textDecoration: 'none',
              }}>MANAGE</Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] Step 2: Start dev server and check `/dashboard` renders without errors, treasury shows, empty state or roster list shows.
```bash
npm run dev
# Open http://localhost:3000/dashboard
```

- [ ] Step 3: Commit
```bash
git add src/app/(game)/dashboard/page.tsx
git commit -m "feat(web): rebuild dashboard for Phase 1 label sim"
```

---

### Task 16: Search page

**Files:**
- Create: `src/app/(game)/search/search-bar.tsx`
- Create: `src/app/(game)/search/page.tsx`

Steps:

- [ ] Step 1: Write `src/app/(game)/search/search-bar.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchBar({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial)
  const router = useRouter()

  function submit() {
    const trimmed = q.trim()
    if (trimmed.length >= 2) router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <input
      value={q}
      onChange={e => setQ(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && submit()}
      placeholder="SEARCH ARTISTS..."
      autoFocus
      style={{
        width: '100%', background: 'var(--bg-panel)', border: '2px solid var(--lime)',
        color: 'var(--ink-hi)', fontFamily: 'Silkscreen, monospace', fontSize: 10,
        padding: '12px 16px', outline: 'none', letterSpacing: 1, display: 'block',
      }}
    />
  )
}
```

- [ ] Step 2: Write `src/app/(game)/search/page.tsx`.

Note: `searchParams` is also a Promise in Next.js 16 -- use `const { q } = await searchParams`. The page queries Supabase directly rather than going through the API routes to avoid an extra HTTP round-trip in a Server Component.

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import SearchBar from './search-bar'
import type { Artist } from '@/lib/types'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function ArtistCard({ artist, metric }: {
  artist: Artist
  metric?: { label: string; value: string; color: string }
}) {
  return (
    <Link href={`/artist/${artist.spotify_id}`} style={{
      display: 'block', background: 'var(--bg-panel)', border: '2px solid var(--line)',
      padding: 14, textDecoration: 'none', color: 'inherit',
    }}>
      <div className="display" style={{ fontSize: 18, color: 'var(--ink-hi)', lineHeight: 1 }}>{artist.name}</div>
      <div style={{ marginTop: 6 }}>
        <span className="tag" style={{
          color: TIER_COLORS[artist.tier] ?? 'var(--ink-mid)', fontSize: 8,
          border: `1px solid ${TIER_COLORS[artist.tier] ?? 'var(--line)'}`, padding: '1px 4px',
        }}>{artist.tier.toUpperCase()}</span>
        {artist.genre && (
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginLeft: 6 }}>
            {artist.genre.toUpperCase().slice(0, 16)}
          </span>
        )}
      </div>
      {metric && (
        <div className="tag" style={{ color: metric.color, fontSize: 9, marginTop: 8 }}>
          {metric.label}: {metric.value}
        </div>
      )}
    </Link>
  )
}

async function getOnRamps(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: label } = await supabase.from('labels').select('genre_1, genre_2, country').eq('id', userId).single()

  // Breaking: top 5 by velocity today
  const { data: bStats } = await supabase.from('artist_stats_daily')
    .select('artist_id, stream_velocity_7d').eq('date', today)
    .not('stream_velocity_7d', 'is', null).order('stream_velocity_7d', { ascending: false }).limit(5)
  const bIds = (bStats ?? []).map(s => s.artist_id)
  const breakingMap = Object.fromEntries((bStats ?? []).map(s => [s.artist_id, s.stream_velocity_7d]))
  const { data: breakingArtists } = bIds.length
    ? await supabase.from('artists').select('*').in('id', bIds)
    : { data: [] as Artist[] }

  // Genre picks: top 3 by momentum for label genres
  let genreArtists: Artist[] = []
  let genreMetrics: Record<string, number> = {}
  if (label?.genre_1) {
    const genres = [label.genre_1, label.genre_2].filter(Boolean) as string[]
    const orFilter = genres.map(g => `genre.ilike.%${g}%`).join(',')
    const { data: gArtists } = await supabase.from('artists').select('id').or(orFilter)
    if (gArtists?.length) {
      const { data: gStats } = await supabase.from('artist_stats_daily')
        .select('artist_id, momentum_score').eq('date', today)
        .in('artist_id', gArtists.map(a => a.id))
        .not('momentum_score', 'is', null).order('momentum_score', { ascending: false }).limit(3)
      if (gStats?.length) {
        genreMetrics = Object.fromEntries(gStats.map(s => [s.artist_id, s.momentum_score]))
        const { data: ga } = await supabase.from('artists').select('*').in('id', gStats.map(s => s.artist_id))
        genreArtists = (ga ?? []) as Artist[]
      }
    }
  }

  // Regional: top 5 by velocity in same country
  let regionalArtists: Artist[] = []
  let regionalMetrics: Record<string, number> = {}
  if (label?.country) {
    const { data: rArtists } = await supabase.from('artists').select('id').eq('country', label.country)
    if (rArtists?.length) {
      const { data: rStats } = await supabase.from('artist_stats_daily')
        .select('artist_id, stream_velocity_7d').eq('date', today)
        .in('artist_id', rArtists.map(a => a.id))
        .not('stream_velocity_7d', 'is', null).order('stream_velocity_7d', { ascending: false }).limit(5)
      if (rStats?.length) {
        regionalMetrics = Object.fromEntries(rStats.map(s => [s.artist_id, s.stream_velocity_7d]))
        const { data: ra } = await supabase.from('artists').select('*').in('id', rStats.map(s => s.artist_id))
        regionalArtists = (ra ?? []) as Artist[]
      }
    }
  }

  return { label, breakingArtists: (breakingArtists ?? []) as Artist[], breakingMap, genreArtists, genreMetrics, regionalArtists, regionalMetrics }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { q } = await searchParams

  let searchResults: Artist[] = []
  if (q && q.length >= 2) {
    const { data } = await supabase.from('artists').select('*').ilike('name', `%${q}%`).neq('tier', 'major').limit(20)
    searchResults = (data ?? []) as Artist[]
  }

  const onRamps = !q ? await getOnRamps(user!.id) : null

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 8 }}>FIND ARTISTS</div>
      <div style={{ marginBottom: 24 }}>
        <SearchBar initial={q ?? ''} />
      </div>

      {q && (
        <div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 12 }}>
            {searchResults.length} RESULTS FOR &quot;{q.toUpperCase()}&quot;
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {searchResults.map(a => <ArtistCard key={a.id} artist={a} />)}
          </div>
          {searchResults.length === 0 && (
            <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>No artists found</div>
          )}
        </div>
      )}

      {!q && onRamps && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {onRamps.breakingArtists.length > 0 && (
            <section>
              <div className="tag" style={{ color: 'var(--lime)', fontSize: 10, marginBottom: 12 }}>BREAKING THIS WEEK</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.breakingArtists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: 'VELOCITY',
                    value: `+${(onRamps.breakingMap[a.id] ?? 0).toFixed(1)}%`,
                    color: 'var(--lime)',
                  }} />
                ))}
              </div>
            </section>
          )}
          {onRamps.genreArtists.length > 0 && (
            <section>
              <div className="tag" style={{ color: 'var(--cyan)', fontSize: 10, marginBottom: 12 }}>YOUR GENRE PICKS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.genreArtists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: 'SCORE',
                    value: `${(onRamps.genreMetrics[a.id] ?? 0).toFixed(0)}`,
                    color: 'var(--cyan)',
                  }} />
                ))}
              </div>
            </section>
          )}
          {onRamps.regionalArtists.length > 0 && (
            <section>
              <div className="tag" style={{ color: 'var(--amber)', fontSize: 10, marginBottom: 12 }}>TRENDING IN YOUR REGION</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.regionalArtists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: 'VELOCITY',
                    value: `+${(onRamps.regionalMetrics[a.id] ?? 0).toFixed(1)}%`,
                    color: 'var(--amber)',
                  }} />
                ))}
              </div>
            </section>
          )}
          {!onRamps.breakingArtists.length && !onRamps.genreArtists.length && !onRamps.regionalArtists.length && (
            <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>
              No on-ramp data yet -- the pipeline runs daily at 07:00 UTC.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] Step 3: Verify -- open `/search`, search bar renders, on-ramps show (or empty state), search results appear for a real query.

- [ ] Step 4: Commit
```bash
git add src/app/(game)/search/
git commit -m "feat(web): add artist search page with on-ramps"
```

---

### Task 17: Artist profile + signing modal

**Files:**
- Delete: `src/app/(game)/artist/[id]/page.tsx`
- Create: `src/app/(game)/artist/[spotifyId]/page.tsx`
- Create: `src/app/(game)/artist/[spotifyId]/client.tsx`

Steps:

- [ ] Step 1: Delete old route
```bash
git rm src/app/\(game\)/artist/\[id\]/page.tsx
```

- [ ] Step 2: Write `src/app/(game)/artist/[spotifyId]/page.tsx`

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ArtistProfileClient from './client'
import type { Artist, ArtistStats, Label } from '@/lib/types'

export default async function ArtistProfilePage({
  params,
}: {
  params: Promise<{ spotifyId: string }>
}) {
  const { spotifyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: artist } = await supabase
    .from('artists').select('*').eq('spotify_id', spotifyId).single()
  if (!artist) notFound()

  const [statsRes, sparkRes, countRes, labelRes] = await Promise.all([
    supabase.from('artist_stats_daily').select('*').eq('artist_id', artist.id)
      .order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('artist_stats_daily').select('date, daily_streams_top10')
      .eq('artist_id', artist.id).order('date', { ascending: false }).limit(7),
    supabase.from('contracts').select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id).eq('status', 'active'),
    supabase.from('labels').select('treasury, id').eq('id', user.id).single(),
  ])

  const stats = statsRes.data as ArtistStats | null
  const statsForClient = stats && artist.tier === 'underground'
    ? { ...stats, momentum_score: null }
    : stats

  const { data: activeContracts } = await supabase
    .from('contracts').select('id', { count: 'exact', head: false })
    .eq('label_id', user.id).eq('status', 'active')

  return (
    <ArtistProfileClient
      artist={artist as Artist}
      stats={statsForClient}
      spark={sparkRes.data ?? []}
      signedByCount={countRes.count ?? 0}
      undergroundSignal={artist.tier === 'underground'}
      label={labelRes.data as Label}
      rosterCount={activeContracts?.length ?? 0}
    />
  )
}
```

- [ ] Step 3: Write `src/app/(game)/artist/[spotifyId]/client.tsx`. Show the complete file.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Artist, ArtistStats, Label } from '@/lib/types'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}
const TIER_BONUS_RANGES: Record<string, [number, number, number]> = {
  underground: [500, 2_000, 1_250],
  emerging: [5_000, 20_000, 12_500],
  rising: [20_000, 80_000, 50_000],
  established: [80_000, 300_000, 190_000],
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtListeners(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function MomentumRing({ score }: { score: number }) {
  const r = 36, cx = 44, cy = 44
  const circ = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ
  return (
    <svg width="88" height="88" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-tile)" strokeWidth="8" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--lime)" strokeWidth="8"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="square"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontFamily="'Jersey 25', monospace" fontSize="22" fill="var(--lime)">{score}</text>
    </svg>
  )
}

function SparkBars({ data }: { data: { date: string; daily_streams_top10: number | null }[] }) {
  const values = [...data].reverse().map(d => d.daily_streams_top10 ?? 0)
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 28, gap: 2 }}>
      {values.map((v, i) => (
        <div key={i} style={{
          width: 6, height: `${(v / max) * 100}%`, minHeight: 2,
          background: 'var(--lime)', opacity: 0.7 + (i / values.length) * 0.3,
        }} />
      ))}
    </div>
  )
}

export default function ArtistProfileClient({
  artist, stats, spark, signedByCount, undergroundSignal, label, rosterCount,
}: {
  artist: Artist
  stats: ArtistStats | null
  spark: { date: string; daily_streams_top10: number | null }[]
  signedByCount: number
  undergroundSignal: boolean
  label: Label
  rosterCount: number
}) {
  const router = useRouter()
  const tierColor = TIER_COLORS[artist.tier] ?? 'var(--ink-mid)'
  const bonusRange = TIER_BONUS_RANGES[artist.tier]
  const defaultBonus = bonusRange ? bonusRange[2] : 0

  const [showModal, setShowModal] = useState(false)
  const [bonus, setBonus] = useState(defaultBonus)
  const [revSplit, setRevSplit] = useState(30)
  const [term, setTerm] = useState<3 | 6 | 12>(6)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const ml = stats?.monthly_listeners ?? 0
  const estWeekly = ml * 0.035 * (revSplit / 100)
  const treasuryAfter = label.treasury - bonus
  const breakEvenWeeks = estWeekly > 0 ? Math.ceil(bonus / estWeekly) : null
  const estTotal = estWeekly * (term * 4.33)

  const canSign = artist.tier !== 'major' && rosterCount < 5 && label.treasury >= bonus

  async function confirmSign() {
    setSubmitting(true); setSubmitError('')
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_id: artist.id, signing_bonus: bonus, rev_split_label_pct: revSplit, term_months: term }),
    })
    if (!res.ok) {
      setSubmitError((await res.json()).error ?? 'Signing failed')
      setSubmitting(false); return
    }
    router.push('/dashboard')
  }

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 760, position: 'relative' }}>
      {/* Back */}
      <Link href="/search" style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'var(--ink-low)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}>
        BACK TO SEARCH
      </Link>

      {/* Artist header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span className="tag" style={{ color: tierColor, border: `1px solid ${tierColor}`, padding: '2px 6px', fontSize: 9 }}>
              {artist.tier.toUpperCase()}
            </span>
            {artist.country && <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{artist.country}</span>}
          </div>
          <div className="display" style={{ fontSize: 48, color: 'var(--ink-hi)', lineHeight: 0.85 }}>{artist.name}</div>
          {artist.genre && <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 8 }}>{artist.genre.toUpperCase()}</div>}
        </div>

        {/* Momentum ring */}
        <div style={{ textAlign: 'center' }}>
          {undergroundSignal ? (
            <div style={{ background: 'var(--bg-tile)', border: '2px solid var(--line)', padding: '14px 18px' }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>LOW SIGNAL</div>
              <div style={{ color: 'var(--ink-mid)', fontSize: 11, marginTop: 4, maxWidth: 120 }}>
                Not enough data for a reliable score
              </div>
            </div>
          ) : stats?.momentum_score != null ? (
            <div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>MOMENTUM</div>
              <MomentumRing score={Math.round(stats.momentum_score)} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>MONTHLY LISTENERS</div>
          <div className="display" style={{ fontSize: 28, color: 'var(--cyan)', lineHeight: 1, marginTop: 4 }}>
            {fmtListeners(ml)}
          </div>
          {stats?.listener_growth_28d != null && (
            <div className="tag" style={{ color: stats.listener_growth_28d >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 9, marginTop: 4 }}>
              {stats.listener_growth_28d >= 0 ? '+' : ''}{stats.listener_growth_28d.toFixed(1)}% (28d)
            </div>
          )}
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>7-DAY STREAMS (TOP 10)</div>
          <div style={{ marginTop: 8 }}>
            <SparkBars data={spark} />
          </div>
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNED BY</div>
          <div className="display" style={{ fontSize: 28, color: 'var(--ink-hi)', lineHeight: 1, marginTop: 4 }}>
            {signedByCount} LABEL{signedByCount !== 1 ? 'S' : ''}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => setShowModal(true)}
          disabled={!canSign}
          style={{
            fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px 20px',
            border: `2px solid ${canSign ? 'var(--lime)' : 'var(--line)'}`,
            color: canSign ? 'var(--lime)' : 'var(--ink-low)',
            background: canSign ? 'rgba(200,255,58,0.08)' : 'transparent',
            cursor: canSign ? 'pointer' : 'not-allowed',
            letterSpacing: 1,
          }}
        >
          {rosterCount >= 5 ? 'ROSTER FULL' : artist.tier === 'major' ? 'NOT SIGNABLE' : 'MAKE AN OFFER'}
        </button>
        <button
          disabled
          title="Phase 4 feature"
          style={{
            fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px 16px',
            border: '1px solid var(--line)', color: 'var(--ink-low)', background: 'transparent',
            cursor: 'not-allowed', letterSpacing: 1, opacity: 0.5,
          }}
        >
          + WATCHLIST
        </button>
      </div>

      {/* Signing modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--bg-panel)', border: '2px solid var(--line)',
            padding: 28, width: '100%', maxWidth: 460,
          }}>
            <div className="tag" style={{ color: 'var(--lime)', fontSize: 10, marginBottom: 20 }}>
              MAKE AN OFFER -- {artist.name.toUpperCase()}
            </div>

            {/* Signing bonus */}
            <div style={{ marginBottom: 16 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>SIGNING BONUS</div>
              {bonusRange && (
                <input type="range" min={bonusRange[0]} max={bonusRange[1]}
                  value={bonus} onChange={e => setBonus(Number(e.target.value))}
                  style={{ width: '100%', marginBottom: 6, accentColor: 'var(--lime)' }}
                />
              )}
              <input type="number" value={bonus}
                min={bonusRange?.[0] ?? 0} max={bonusRange?.[1] ?? 999_999}
                onChange={e => setBonus(Number(e.target.value))}
                style={{
                  background: 'var(--bg-tile)', border: '1px solid var(--line)',
                  color: 'var(--amber)', fontFamily: 'Jersey 25, monospace', fontSize: 24,
                  padding: '6px 10px', width: '100%', outline: 'none',
                }}
              />
            </div>

            {/* Rev split */}
            <div style={{ marginBottom: 16 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>
                LABEL REVENUE SPLIT: {revSplit}%
              </div>
              <input type="range" min={10} max={50} value={revSplit}
                onChange={e => setRevSplit(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cyan)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>10% (artist-friendly)</span>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>50% (label-heavy)</span>
              </div>
            </div>

            {/* Term */}
            <div style={{ marginBottom: 20 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>CONTRACT TERM</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([3, 6, 12] as const).map(t => (
                  <button key={t} onClick={() => setTerm(t)} style={{
                    flex: 1, fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '8px',
                    border: `2px solid ${term === t ? 'var(--lime)' : 'var(--line)'}`,
                    color: term === t ? 'var(--lime)' : 'var(--ink-mid)',
                    background: term === t ? 'rgba(200,255,58,0.08)' : 'transparent', cursor: 'pointer',
                  }}>{t} MO</button>
                ))}
              </div>
            </div>

            {/* Live preview */}
            <div style={{ background: 'var(--bg-tile)', border: '1px solid var(--line)', padding: 12, marginBottom: 20 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 8 }}>DEAL PREVIEW</div>
              {[
                { label: 'EST. WEEKLY ROYALTIES', value: fmtUSD(estWeekly), color: 'var(--lime)' },
                { label: 'TREASURY AFTER SIGNING', value: fmtUSD(treasuryAfter), color: treasuryAfter < 0 ? 'var(--rose)' : 'var(--amber)' },
                { label: 'BREAK-EVEN', value: breakEvenWeeks ? `${breakEvenWeeks} WEEKS` : 'N/A', color: 'var(--cyan)' },
                { label: `EST. TOTAL (${term} MO)`, value: fmtUSD(estTotal), color: 'var(--violet)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{label}</span>
                  <span className="tag" style={{ color, fontSize: 10 }}>{value}</span>
                </div>
              ))}
            </div>

            {submitError && <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginBottom: 8 }}>{submitError}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{
                flex: 1, fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
                border: '1px solid var(--line)', color: 'var(--ink-mid)', background: 'transparent', cursor: 'pointer',
              }}>CANCEL</button>
              <button onClick={confirmSign} disabled={submitting || treasuryAfter < 0} style={{
                flex: 2, fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
                border: '2px solid var(--lime)', color: 'var(--lime)',
                background: 'rgba(200,255,58,0.1)', cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting || treasuryAfter < 0 ? 0.5 : 1,
              }}>
                {submitting ? 'SIGNING...' : 'CONFIRM SIGNING'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] Step 4: Verify -- visit `/artist/[any-spotify-id]`, profile renders, MAKE AN OFFER opens modal, sliders update live preview, CONFIRM SIGNING calls API.

- [ ] Step 5: Commit
```bash
git add src/app/\(game\)/artist/
git commit -m "feat(web): add artist profile page and signing modal"
```

---

### Task 18: Contracts page + history page + nav update + cleanup

**Files:**
- Create: `src/app/(game)/contracts/page.tsx`
- Create: `src/app/(game)/contracts/actions.tsx`
- Create: `src/app/(game)/history/page.tsx`
- Modify: `src/app/(game)/layout.tsx` (update nav to Phase 1 routes)
- Delete: old routes that no longer exist

Steps:

- [ ] Step 1: Write `src/app/(game)/contracts/actions.tsx`

```tsx
'use client'
import { useRouter } from 'next/navigation'

export function ReleaseButton({ contractId }: { contractId: string }) {
  const router = useRouter()
  async function handleRelease() {
    await fetch(`/api/contracts/${contractId}/release`, { method: 'POST' })
    router.refresh()
  }
  return (
    <button onClick={handleRelease} style={{
      fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
      border: '1px solid var(--rose)', color: 'var(--rose)', background: 'transparent', cursor: 'pointer',
    }}>RELEASE</button>
  )
}

export function DropButton({ contractId, artistName }: { contractId: string; artistName: string }) {
  const router = useRouter()
  async function handleDrop() {
    if (!window.confirm(`Drop ${artistName}? A buyout penalty will be deducted based on remaining weeks.`)) return
    const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' })
    const body = await res.json()
    if (!res.ok) { alert(body.error ?? 'Drop failed'); return }
    router.refresh()
  }
  return (
    <button onClick={handleDrop} style={{
      fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
      border: '1px solid var(--rose)', color: 'var(--rose)', background: 'transparent', cursor: 'pointer',
    }}>DROP</button>
  )
}
```

- [ ] Step 2: Write `src/app/(game)/contracts/page.tsx`.

The weekly-est column is omitted (requires joining `artist_stats_daily` per contract row at render time -- deferred to Phase 2). Grid uses 6 data columns plus the action button.

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Contract } from '@/lib/types'
import { ReleaseButton, DropButton } from './actions'

type ContractRow = Contract & { artists: { name: string; tier: string; spotify_id: string } }

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function weeksLeft(endDate: string) {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (7 * 86_400_000)))
}

export default async function ContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('contracts')
    .select('*, artists(name, tier, spotify_id)')
    .eq('label_id', user.id)
    .order('created_at', { ascending: false })

  const contracts = (data ?? []) as ContractRow[]
  const active = contracts.filter(c => c.status === 'active')
  const expired = contracts.filter(c => c.status === 'expired')

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 900 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>CONTRACTS</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 24 }}>MANAGE ROSTER</div>

      {/* Expired */}
      {expired.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="tag" style={{ color: 'var(--rose)', fontSize: 10, marginBottom: 10 }}>
            EXPIRED -- ACTION REQUIRED
          </div>
          {expired.map(c => {
            const tc = TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)'
            return (
              <div key={c.id} style={{
                background: 'rgba(255,84,120,0.04)', border: '2px solid var(--rose)',
                padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span style={{ color: 'var(--ink-hi)', fontSize: 14 }}>{c.artists.name}</span>
                  <span className="tag" style={{ color: tc, fontSize: 8, marginLeft: 8, border: `1px solid ${tc}`, padding: '1px 4px' }}>
                    {c.artists.tier.toUpperCase()}
                  </span>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 4 }}>
                    Ended {fmtDate(c.end_date)} · Royalties: {fmtUSD(c.royalties_earned)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/artist/${c.artists.spotify_id}`} style={{
                    fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '5px 10px',
                    border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
                  }}>RE-SIGN</Link>
                  <ReleaseButton contractId={c.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Active */}
      <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
        <div style={{ padding: '8px 16px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>ACTIVE CONTRACTS</span>
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{active.length} / 5</span>
        </div>
        {active.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-mid)', fontSize: 13 }}>
            No active contracts. <Link href="/search" style={{ color: 'var(--lime)' }}>Find an artist</Link>
          </div>
        ) : active.map(c => {
          const tc = TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)'
          const netPnl = c.royalties_earned - c.signing_bonus - c.dev_spend_total
          const wl = weeksLeft(c.end_date)
          return (
            <div key={c.id} style={{
              padding: '14px 16px', borderBottom: '1px solid var(--line-soft)',
              display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 80px auto',
              gap: 12, alignItems: 'center',
            }}>
              <div>
                <Link href={`/artist/${c.artists.spotify_id}`} style={{ color: 'var(--ink-hi)', textDecoration: 'none', fontSize: 14 }}>{c.artists.name}</Link>
                <div style={{ marginTop: 3 }}>
                  <span className="tag" style={{ color: tc, fontSize: 8, border: `1px solid ${tc}`, padding: '1px 4px' }}>{c.artists.tier.toUpperCase()}</span>
                  <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginLeft: 8 }}>{fmtDate(c.start_date)} - {fmtDate(c.end_date)}</span>
                </div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>SIGNED</div>
                <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11, marginTop: 2 }}>{fmtUSD(c.signing_bonus)}</div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>ROYALTIES</div>
                <div className="tag" style={{ color: 'var(--lime)', fontSize: 11, marginTop: 2 }}>{fmtUSD(c.royalties_earned)}</div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>NET P&L</div>
                <div className="tag" style={{ color: netPnl >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 11, marginTop: 2 }}>{netPnl >= 0 ? '+' : ''}{fmtUSD(netPnl)}</div>
              </div>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>SPLIT / WKS</div>
                <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11, marginTop: 2 }}>{c.rev_split_label_pct}% / {wl}w</div>
              </div>
              <DropButton contractId={c.id} artistName={c.artists.name} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] Step 3: Write `src/app/(game)/history/page.tsx`.

```tsx
import { createClient } from '@/lib/supabase/server'
import type { LabelHistory, Tier } from '@/lib/types'

const TIER_COLORS: Record<Tier, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)', major: 'var(--rose)',
}
function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('label_history')
    .select('*')
    .eq('label_id', user.id)
    .order('completed_at', { ascending: false })

  const history = (data ?? []) as LabelHistory[]

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>LABEL HISTORY</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 24 }}>ALL CONTRACTS</div>

      {history.length === 0 ? (
        <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>No completed contracts yet.</div>
      ) : (
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 120px 100px 110px 100px 80px',
            gap: 10, padding: '8px 16px', borderBottom: '2px solid var(--line)',
          }}>
            {['ARTIST', 'TIER', 'DATES', 'ROYALTIES', 'SIGNING COST', 'NET P&L', 'REASON'].map(h => (
              <span key={h} className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{h}</span>
            ))}
          </div>
          {history.map(h => {
            const tc = TIER_COLORS[h.artist_tier as Tier] ?? 'var(--ink-mid)'
            return (
              <div key={h.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 120px 100px 110px 100px 80px',
                gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--ink-hi)', fontSize: 13 }}>{h.artist_name}</span>
                <span className="tag" style={{ color: tc, border: `1px solid ${tc}`, padding: '1px 4px', fontSize: 8 }}>
                  {h.artist_tier.toUpperCase()}
                </span>
                <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 8 }}>
                  {fmtDate(h.completed_at)}
                </span>
                <span className="tag" style={{ color: 'var(--lime)', fontSize: 10 }}>{fmtUSD(h.total_royalties)}</span>
                <span className="tag" style={{ color: 'var(--amber)', fontSize: 10 }}>{fmtUSD(h.signing_bonus)}</span>
                <span className="tag" style={{ color: h.net_pnl >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 10 }}>
                  {h.net_pnl >= 0 ? '+' : ''}{fmtUSD(h.net_pnl)}
                </span>
                <span className="tag" style={{ color: h.reason === 'dropped' ? 'var(--rose)' : 'var(--ink-mid)', fontSize: 8 }}>
                  {h.reason.toUpperCase()}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] Step 4: Update `src/app/(game)/layout.tsx` nav items.

The existing nav (read above) has 6 items pointing at old routes (`/market`, `/scout`, `/anr`, `/league`, `/portfolio`). Replace with 4 Phase 1 routes and collapse the two-section nav into a single section.

Replace:
```ts
const NAV_ITEMS = [
  { icon: '◼', label: 'LABEL HQ',    href: '/dashboard' },
  { icon: '◆', label: 'ROSTER',      href: '/market' },
  { icon: '✦', label: 'SCOUT',       href: '/scout' },
  { icon: '$', label: 'A&R LAB',     href: '/anr' },
  { icon: '▲', label: 'MINI LEAGUE', href: '/league' },
  { icon: '◉', label: 'WEEKLY OBJ.', href: '/portfolio' },
]
```

With:
```ts
const NAV_ITEMS = [
  { icon: '◼', label: 'LABEL HQ',  href: '/dashboard' },
  { icon: '◆', label: 'SEARCH',    href: '/search' },
  { icon: '✦', label: 'CONTRACTS', href: '/contracts' },
  { icon: '▲', label: 'HISTORY',   href: '/history' },
]
```

Replace the nav render block:
```tsx
{/* Old */}
<nav style={{ padding: '8px 0', flex: 1 }}>
  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, padding: '8px 16px' }}>OFFICE</div>
  {NAV_ITEMS.slice(0, 4).map(item => <SideItem key={item.href} {...item}/>)}
  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, padding: '12px 16px 8px' }}>COMPETE</div>
  {NAV_ITEMS.slice(4).map(item => <SideItem key={item.href} {...item}/>)}
</nav>
```

With:
```tsx
{/* New */}
<nav style={{ padding: '8px 0', flex: 1 }}>
  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, padding: '8px 16px' }}>OFFICE</div>
  {NAV_ITEMS.map(item => <SideItem key={item.href} {...item}/>)}
</nav>
```

- [ ] Step 5: Delete old routes that no longer exist in the Phase 1 route map. Check with `ls` first -- skip any path that does not exist.
```bash
ls src/app/\(game\)/market/page.tsx 2>/dev/null && git rm src/app/\(game\)/market/page.tsx
ls src/app/\(game\)/league/page.tsx 2>/dev/null && git rm src/app/\(game\)/league/page.tsx
ls src/app/\(game\)/portfolio/page.tsx 2>/dev/null && git rm src/app/\(game\)/portfolio/page.tsx
ls src/app/api/market/route.ts 2>/dev/null && git rm src/app/api/market/route.ts
ls src/app/api/roster/route.ts 2>/dev/null && git rm src/app/api/roster/route.ts
ls src/app/api/artists/route.ts 2>/dev/null && git rm src/app/api/artists/route.ts
```

- [ ] Step 6: Verify all pages render without build errors
```bash
npm run build
# Should complete with no errors. Fix any type errors before committing.
```

- [ ] Step 7: Final commit
```bash
git add src/app/\(game\)/contracts/ src/app/\(game\)/history/page.tsx src/app/\(game\)/layout.tsx
git commit -m "feat(web): add contracts and history pages, update nav, remove old stock-market routes"
```

---

## Self-Review

### 1. Spec coverage

| Spec requirement | Task |
|---|---|
| DB schema (artists alter, labels, scrape_raw, artist_stats_daily, contracts, label_history) | Task 1 |
| Pipeline step 1-2 (scraper writes scrape_raw) | Task 2 |
| Pipeline steps 3-6 (metrics, tier, royalties) | Tasks 3-6 |
| Route `/` redirects correctly | Task 7 |
| Route `/login`, `/signup` | Already exist (no changes needed) |
| Route `/onboarding` | Task 14 |
| Route `/dashboard` | Task 15 |
| Route `/search` | Task 16 |
| Route `/artist/[spotifyId]` | Task 17 |
| Route `/contracts` | Task 18 |
| Route `/history` | Task 18 |
| Middleware auth + onboarding redirect | Task 8 |
| Nav updated (4 items) | Task 18 |
| POST /api/labels | Task 9 |
| GET+PATCH /api/labels/me | Task 9 |
| GET /api/artists/search | Task 10 |
| GET /api/artists/on-ramps | Task 10 |
| GET /api/artists/[spotifyId] | Task 11 |
| POST+GET /api/contracts | Task 12 |
| DELETE /api/contracts/[id] | Task 12 |
| POST /api/contracts/[id]/release | Task 12 |
| POST /api/royalties/weekly | Task 13 |
| Underground signal (hide momentum_score) | Tasks 11, 17 |
| Roster cap (5 contracts) | Task 12 |
| Signing bonus tier ranges | Task 12 |
| Sunday-only royalty run | Task 6 |
| Contract expiry + label_history write | Task 6 |
| Early drop with buyout penalty | Task 12 |

All spec section 7 routes and section 8 API routes covered. All pipeline steps covered.

### 2. Placeholder scan

No TBDs or stubs. The weekly-est column on `contracts/page.tsx` is intentionally omitted (requires joining `artist_stats_daily` per contract row at render time -- deferred to Phase 2 when the pipeline is stable). The grid uses 5 data columns instead of 6 and the column is absent, so no misleading zero is displayed.

### 3. Type consistency

- `createClient` from `@/lib/supabase/server` is called with `await` throughout -- matches the actual `async function createClient()` signature in `src/lib/supabase/server.ts`
- `params` is awaited before destructuring in all route handlers and page components -- correct for Next.js 16
- `Response.json(...)` used everywhere -- no `NextResponse` import needed
- `ArtistProfileClient` props defined in `page.tsx` and consumed in `client.tsx` -- consistent
- `TIER_COLORS` and `TIER_BONUS_RANGES` defined locally in client components to avoid server/client import boundary issues
- `LabelHistory` and `Tier` types used in `history/page.tsx` -- must be exported from `@/lib/types` (confirm these are added in Task 1 alongside the new DB types)

### 4. Ambiguity resolutions

- **Nav update placement**: the spec lists "Nav updated (4 items)" as a Task 8 concern, but the nav lives in `layout.tsx` alongside contracts and history. Placing it in Task 18 keeps all layout changes co-located with the new pages that depend on them.
- **`end_date` calculation**: uses `term_months * 30` days (approximate). The GDD does not specify an exact day-count method; 30 days/month is acceptable for Phase 1.
- **Weekly streams for royalties**: both the Python pipeline (Task 5) and `/api/royalties/weekly` (Task 13) use a 7-day lookback window ending on the run date. Consistent.
- **`scrape_raw.track_playcounts` schema**: stored as `[{track_id, name, playcount}]`. `compute_daily_streams` expects `list[dict]` with keys `track_id` and `playcount`. Consistent across Tasks 2, 3, 5, 6.
- **Scraper caller update**: the existing `scraper/main.py` calls old schema functions. After Task 2 adds `store_scrape_raw`, a step in Task 2 must update `scraper/main.py` to call `store_scrape_raw` instead. Read `pipeline/scraper/main.py` before writing that step to find the exact call site.
