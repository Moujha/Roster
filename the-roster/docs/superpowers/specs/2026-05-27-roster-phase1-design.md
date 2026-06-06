# Roster — Phase 1 Design Spec
**Date:** 2026-05-27  
**Source of Truth:** `docs/ROSTER_GDD_v1.0.docx`  
**Scope:** Phase 1 — Playable solo loop (sign artists, earn royalties, see dashboard)

---

## 1. Context

The current codebase (`the-roster/`) implements a fantasy stock-market game (shares, buy/sell, market prices). The GDD v1.0 defines a record-label management sim (contracts, royalties, development). This spec covers the Phase 1 rebuild to align the codebase with the GDD.

**What survives from the current codebase:**
- Playwright bearer-token auth + `queryArtistOverview` GraphQL scraper
- Supabase infrastructure + Supabase Auth
- Next.js app shell + pixel-art design system (Silkscreen/Jersey 25/Pixelify Sans fonts, CSS variables)
- `artists` table (extended, not replaced)
- `seed.py` artist list

**What is replaced:**
- DB schema (`market_prices`, `leagues`, `rosters`, `transactions` dropped; `users` → `labels`)
- All game logic (points-based scoring → royalty engine)
- All frontend pages (new information architecture)

---

## 2. Phased roadmap

| Phase | Deliverable |
|-------|-------------|
| **1 (this spec)** | DB schema · pipeline · signing flow · weekly royalties · dashboard |
| 2 | Development mechanic (playlist pitch / social push / release amp multipliers) |
| 3 | Scouting system + label reputation tiers |
| 4 | Watchlist · 90-day leaderboard · curated on-ramps |

---

## 3. Database schema

### 3.1 Modified tables

**`artists`** — extend, do not replace
```sql
ALTER TABLE artists
  ADD COLUMN tier text NOT NULL DEFAULT 'emerging'
    CHECK (tier IN ('underground','emerging','rising','established','major')),
  ADD COLUMN regional_star_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN tier_updated_at date;
-- Drop image_url: GDD §1.3 — no artist images at MVP
ALTER TABLE artists DROP COLUMN IF EXISTS image_url;
```

Tier classification by global monthly listeners (GDD §3.5.1):

| Tier | Monthly listeners |
|------|------------------|
| underground | 0 – 50k |
| emerging | 50k – 500k |
| rising | 500k – 2M |
| established | 2M – 10M |
| major | 10M+ (not signable) |

**`users` → `labels`** — rename and restructure
```sql
CREATE TABLE labels (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  label_name  text NOT NULL,
  genre_1     text,
  genre_2     text,
  country     text,
  treasury    numeric(12,2) NOT NULL DEFAULT 400000,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Drop: users table (budget/GR economy replaced by treasury/$)
```

Starting treasury: **$400,000** (GDD §6.1.3 — "seed backer" framing).

### 3.2 New tables

**`scrape_raw`** — immutable daily raw data from scraper
```sql
CREATE TABLE scrape_raw (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id        uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  scraped_at       date NOT NULL,
  monthly_listeners bigint,
  track_playcounts jsonb,  -- [{track_id, name, playcount}, ...] top-10
  UNIQUE (artist_id, scraped_at)
);
```

**`artist_stats_daily`** — computed metrics (replaces `artist_stats`)
```sql
CREATE TABLE artist_stats_daily (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id            uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  date                 date NOT NULL,
  monthly_listeners    bigint,
  daily_streams_top10  bigint,        -- delta from previous day's playcounts
  stream_velocity_7d   numeric(8,2),  -- % change vs 7 days prior
  listener_growth_28d  numeric(8,2),  -- % change vs 28 days prior
  catalog_depth_score  numeric(5,4),  -- 0–1, higher = more spread
  momentum_score       numeric(5,2),  -- 0–100 composite
  UNIQUE (artist_id, date)
);
CREATE INDEX ON artist_stats_daily (artist_id, date DESC);
```

**`contracts`** — replaces `rosters` + `transactions`
```sql
CREATE TABLE contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id              uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  artist_id             uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','expired','dropped')),
  signing_bonus         numeric(10,2) NOT NULL,
  rev_split_label_pct   numeric(4,2) NOT NULL,  -- label's %, e.g. 30.00
  term_months           int NOT NULL CHECK (term_months IN (3,6,12)),
  start_date            date NOT NULL,
  end_date              date NOT NULL,           -- start_date + term_months
  baseline_listeners    bigint,                  -- ML at signing date
  baseline_growth_pct   numeric(6,2),            -- 28d growth trend at signing
  royalties_earned      numeric(12,2) NOT NULL DEFAULT 0,
  dev_spend_total       numeric(12,2) NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
  -- No unique(label_id, artist_id): multiple labels may hold the same artist (GDD §4.3)
);
CREATE INDEX ON contracts (label_id, status);
CREATE INDEX ON contracts (end_date) WHERE status = 'active';
```

Roster cap: **5 active contracts per label** — enforced at application level in the signing API route, not by DB constraint.

**`label_history`** — immutable log of completed contracts
```sql
CREATE TABLE label_history (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id             uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  contract_id          uuid NOT NULL REFERENCES contracts(id),
  artist_name          text NOT NULL,
  artist_tier          text NOT NULL,
  listeners_at_signing bigint,
  listeners_at_end     bigint,
  signing_bonus        numeric(10,2) NOT NULL,  -- captured at write time from contracts row
  total_royalties      numeric(12,2) NOT NULL DEFAULT 0,
  total_dev_spend      numeric(12,2) NOT NULL DEFAULT 0,
  net_pnl              numeric(12,2) NOT NULL,  -- total_royalties - signing_bonus - total_dev_spend
  reason               text NOT NULL CHECK (reason IN ('natural','dropped')),
  completed_at         date NOT NULL
  -- Never updated after insert
);
```

### 3.3 Dropped tables
`market_prices`, `leagues`, `rosters` (old), `transactions` (old)

---

## 4. Data pipeline

### 4.1 Daily pipeline (runs ~07:00 UTC via GitHub Actions)

**Step 1 — Scrape** (existing `scraper/main.py`, unchanged)  
Playwright intercepts Spotify bearer token → `queryArtistOverview` GraphQL → returns `monthly_listeners` + `top_tracks[{track_id, name, playcount}]`.

**Step 2 — Write `scrape_raw`**  
Insert `(artist_id, today, monthly_listeners, track_playcounts)`. Raw data is immutable; metrics are always recomputable.

**Step 3 — Compute `daily_streams_top10`**  
Match tracks by `track_id` between today and yesterday's `scrape_raw` row. Sum positive deltas only:
```python
daily_streams = sum(
    max(0, today[tid] - yesterday[tid])
    for tid in today_tracks
    if tid in yesterday_tracks
)
```
If no yesterday row exists (first scrape, or track order changed significantly): store `NULL` — excluded from velocity calculations.

**Step 4 — Compute derived metrics**

| Metric | Formula |
|--------|---------|
| `stream_velocity_7d` | `(streams_last_7d − streams_prev_7d) / streams_prev_7d × 100` |
| `listener_growth_28d` | `(ML_today − ML_28d_ago) / ML_28d_ago × 100` |
| `catalog_depth_score` | `1 − Σ(track_share²)` where `track_share = track_streams / total_streams` (Herfindahl-based; 0 = all on one track, ~0.9 = perfectly spread) |
| `momentum_score` | `clamp(v_norm×0.4 + g_norm×0.35 + depth_norm×0.25, 0, 100)` — formula hidden from players per GDD §3.2 |

Normalization before weighting (inputs are unbounded percentages; depth is 0–1):
- `v_norm` = `clamp((stream_velocity_7d + 50) / 2, 0, 100)` — maps −50% → 0, +150% → 100
- `g_norm` = `clamp((listener_growth_28d + 20) / 0.8, 0, 100)` — maps −20% → 0, +60% → 100
- `depth_norm` = `catalog_depth_score × 100` — already 0–1, scale to 0–100

These normalization bounds are calibration values. Adjust after observing real data distribution; the formula structure is fixed by the GDD, the scaling is not.

Momentum Score is **computed for all tiers** (used for on-ramp queries). It is **not exposed via the API** for Underground artists — the artist profile endpoint omits `momentum_score` and returns `underground_signal: true` instead. Show "Low signal" badge on the frontend.

**Step 5 — Classify tier + upsert**  
Re-derive `tier` from current `monthly_listeners`. If tier changed, update `artists.tier` and `artists.tier_updated_at`. Upsert into `artist_stats_daily`.

**Step 6 — Weekly royalty calculation (Sunday only)**  
After the daily scrape completes, check if today is Sunday. If yes, trigger the royalty calculation (see §5).

### 4.2 On-ramp data (computed daily, cached)

| On-ramp | Query |
|---------|-------|
| Breaking this week | Top 5 artists by `stream_velocity_7d` across catalog |
| Your genre picks | Top 3 by `momentum_score` matching `label.genre_1` or `label.genre_2` |
| Trending in your region | Top 3–5 by `stream_velocity_7d` where `artists.country = label.country` |

---

## 5. Royalty formula

### 5.1 Phase 1 (no development multipliers)

```
weekly_streams  = Σ daily_streams_top10  for Mon–Sun of the week
royalties       = weekly_streams × $0.035 × (rev_split_label_pct / 100)
```

**$0.035/stream** = $0.0035 real-world baseline × 10× economy compression (GDD §6.1.1).

Sanity check (GDD §6.1.2): Emerging artist at 275k ML ≈ 275k streams/week → 275,000 × $0.035 × 0.30 = **$2,888/wk** ✓

### 5.2 Sunday royalty run

For every `active` contract:
1. Sum `daily_streams_top10` from `artist_stats_daily` for the 7 days ending today
2. Apply formula above
3. `UPDATE contracts SET royalties_earned = royalties_earned + royalties WHERE id = ?`
4. `UPDATE labels SET treasury = treasury + royalties WHERE id = ?`

### 5.3 Contract expiry (checked daily)

After each daily scrape run:
```sql
UPDATE contracts
SET status = 'expired'
WHERE status = 'active' AND end_date <= CURRENT_DATE;
```
On expiry: insert into `label_history`. Surface on dashboard as "Contract expired — action required."

Early drop (player-initiated): pay buyout penalty = remaining weeks × estimated weekly royalties × 0.5. Deduct from treasury, set `status = 'dropped'`, insert `label_history` with `reason = 'dropped'`.

---

## 6. Signing mechanic

### 6.1 Contract variables (GDD §4.1)

| Variable | Default | Range |
|----------|---------|-------|
| Signing bonus | Tier midpoint | Tier min–max |
| Rev split (label %) | 30% | 10–50% |
| Contract term | 6 months | 3 / 6 / 12 months |

### 6.2 Signing bonus ranges (GDD §3.5.4)

| Tier | Range | Midpoint (pre-fill) |
|------|-------|---------------------|
| Underground | $500–$2k | $1,250 |
| Emerging | $5k–$20k | $12,500 |
| Rising | $20k–$80k | $50,000 |
| Established | $80k–$300k | $190,000 |
| Major | Not signable | — |

### 6.3 Signing API route: `POST /api/contracts`

Pre-conditions checked server-side:
1. Label has fewer than 5 active contracts
2. `label.treasury >= signing_bonus`
3. Artist tier is not `major` (unless `regional_star_flag = true`)

On success:
1. Insert `contracts` row (`status = 'active'`, `start_date = today`, `end_date = today + term_months`)
2. Record `baseline_listeners` and `baseline_growth_pct` from latest `artist_stats_daily`
3. `UPDATE labels SET treasury = treasury - signing_bonus`

---

## 7. Frontend pages

### 7.1 Route map

| Route | Page | Auth required |
|-------|------|---------------|
| `/` | Redirect → `/dashboard` if authed, `/login` if not | — |
| `/login` | Login | No |
| `/signup` | Sign up | No |
| `/onboarding` | Label creation (3-step) | Yes — redirect if label exists |
| `/dashboard` | Label dashboard | Yes |
| `/search` | Artist search + on-ramps | Yes |
| `/artist/[spotifyId]` | Artist profile | Yes |
| `/contracts` | Active + expired contracts | Yes |
| `/history` | Label history (immutable log) | Yes |

Middleware: authenticated users with no `labels` row → redirect to `/onboarding`.

### 7.2 Onboarding (3 steps, `/onboarding`)

**Step 1** — Label name  
Single text input, large type. Ghost text: "What's your label called?" No logo, no extras.  
On confirm: `POST /api/labels` with `label_name`.

**Step 2** — Genre selection  
3×3 grid of genre tiles (text-only, Silkscreen font, no emojis). Pick 1–2. Selected state: colored border + tinted background. Genres: Afrobeats, Hip-Hop, Indie, Electronic, Pop, R&B / Soul, Latin, K-Pop, Rock.  
On confirm: `PATCH /api/labels/me` with `genre_1`, `genre_2`.

**Step 3** — First artist suggestion  
3 artist cards side-by-side based on selected genres. Each shows: name, Momentum Score, monthly listeners, one-line data hook ("Up 34% this week"). Search bar visible and active at all times.  
On signing or skip: redirect to `/dashboard`.

### 7.3 Dashboard (`/dashboard`)

- **Treasury** (large, amber) + **last week's royalties** (lime, positive/negative delta)
- **Roster** count (X / 5)
- **Active contracts list**: artist name, tier badge, weeks remaining, last week's royalties
- **Expired contracts banner**: surfaced above active list, with RE-SIGN / RELEASE actions
- **Empty state** (no contracts): "Sign your first artist →" CTA linking to `/search`
- Week 1 state: "First royalties land Sunday" message instead of last-week figure

### 7.4 Search (`/search`)

- Search bar (full width, always prominent)
- 3 on-ramp sections below (Breaking this week / Your genre picks / Trending in your region)
- Each on-ramp: max 3–5 artist cards showing name + primary metric (velocity % or momentum score)
- On-ramps are prompts, not a catalog browser — clicking opens the artist profile

### 7.5 Artist profile (`/artist/[spotifyId]`)

**Always visible (New label — all Phase 1 users):**
- Name, tier badge, country
- Momentum Score as a ring gauge (0–100) — hidden for Underground: "Low signal" badge with tooltip "Not enough data for a reliable score — judge for yourself"
- Monthly listeners (current) + 28d % change
- Top 10 tracks with 7-day daily stream spark bars
- "Signed by N labels" count
- MAKE AN OFFER button (disabled if roster full or Major tier)
- + WATCHLIST button (passive, no alert — Phase 4 functional, button visible now)

**Established reputation+ only (Phase 3):** stream velocity (7d), listener-to-stream ratio, catalog depth score

### 7.6 Signing screen (modal over artist profile)

Three controls with live preview:
1. **Signing bonus** — range slider + numeric input, pre-filled at tier midpoint
2. **Rev split** — slider 10–50% (label's share), pre-filled at 30%
3. **Contract term** — pill buttons: 3 MO / 6 MO / 12 MO, pre-filled at 6 MO

Live preview panel:
- Est. weekly royalties at current stream levels
- Treasury remaining after signing
- Break-even weeks
- Est. total royalties over term

CONFIRM SIGNING → `POST /api/contracts` → success redirects to `/dashboard`.

### 7.7 Contracts (`/contracts`)

**Active contracts:** Per-contract card showing signing bonus paid, royalties earned to date, net P&L (royalties − signing bonus − dev spend), rev split %, weeks remaining. DROP button (shows buyout penalty before confirming).

**Expired contracts:** Surfaced at top with RE-SIGN and RELEASE actions. RE-SIGN opens signing screen with artist's updated stats + new bonus range. RELEASE closes contract and writes to `label_history`.

### 7.8 Label history (`/history`)

Immutable log of all completed contracts. Columns: artist name, tier at signing, contract dates, total royalties, signing cost, net P&L, reason (natural / dropped). Sorted by `completed_at` desc.

---

## 8. API routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/labels` | Create label (onboarding step 1) |
| GET | `/api/labels/me` | Label info + treasury |
| PATCH | `/api/labels/me` | Update genres/country (onboarding step 2) |
| GET | `/api/artists/search?q=` | Search artists by name |
| GET | `/api/artists/on-ramps` | Breaking / genre / regional on-ramps |
| GET | `/api/artists/[spotifyId]` | Artist profile + latest stats |
| POST | `/api/contracts` | Sign artist (create contract) |
| GET | `/api/contracts` | List label's contracts |
| DELETE | `/api/contracts/[id]` | Drop contract (early termination) |
| POST | `/api/contracts/[id]/release` | Release expired contract |
| POST | `/api/royalties/weekly` | Sunday royalty run (cron/webhook) |

---

## 9. Cron jobs

| Schedule | Action |
|----------|--------|
| Daily 07:00 UTC | Run Python scraper → compute metrics → upsert `artist_stats_daily` |
| Daily 07:30 UTC | Check contract expirations, update status, write `label_history` |
| Sunday 08:00 UTC | Weekly royalty calculation (after daily scrape completes) |

---

## 10. Out of scope for Phase 1

- Development mechanic (playlist pitching, social push, release amplification) → Phase 2
- Scout slots and scout reports → Phase 3
- Label reputation scoring → Phase 3
- Watchlist (button visible but non-functional) → Phase 4
- Rolling 90-day leaderboard → Phase 4
- Regional Star flag logic (column exists, defaults to false) → Phase 4
- Geographic royalty mixing (flat $0.035/stream rate used) → Phase 4
- Breaking alerts → Phase 4
