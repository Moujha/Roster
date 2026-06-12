# Watchlist — Design Spec
**Date:** 2026-06-12  
**GDD ref:** §9.3  
**Status:** Approved

---

## Overview

The Watchlist is a passive, publicly visible curation tool. Any label can save any artist — signed or unsigned — with no alerts, thresholds, or automation. Its primary value is social: a timestamped record of conviction before an artist broke. Seeing a competitor watch an unfamiliar name is a discovery signal in itself.

---

## Database

**New table: `watchlists`**

```sql
create table watchlists (
  id         uuid primary key default gen_random_uuid(),
  label_id   uuid not null references labels(id) on delete cascade,
  artist_id  uuid not null references artists(id) on delete cascade,
  added_at   timestamptz not null default now(),
  unique (label_id, artist_id)
);
```

No additional indexes needed for MVP scale.

---

## API Routes

### `GET /api/watchlist`
Returns the authenticated label's watchlist with artist snapshot data (name, tier, monthly listeners, 7-day stream bars for sparkline, momentum score, spotify_id).

### `POST /api/watchlist`
Body: `{ artist_id: string }`  
Adds artist to watchlist. Idempotent — silently succeeds if already present.  
Returns `{ ok: true, added_at: string }`.

### `DELETE /api/watchlist/[artistId]`
Removes artist from the authenticated label's watchlist.  
Returns `{ ok: true }`.

### `GET /api/labels/[labelId]/watchlist`
Public, unauthenticated read. Returns label name, reputation, and their full watchlist with the same artist snapshot data as the private endpoint. Used for viewing rivals' lists.

---

## UI Changes

### 1. Artist Profile (`/artist/[spotifyId]`)

**Watchlist toggle button** — sits alongside the Sign button in the action row. Shows `☆ WATCHLIST` when not watching, `★ WATCHING` (lime-accented) when already on list. Single click toggles state via `POST` or `DELETE`.

**"Watched by" section** — below the main artist data, always visible (no rep gate). Shows a row of label name chips. Each chip links to `/labels/[labelId]`. If 0 watchers, section is hidden. If >5, show first 5 + "+N more" (non-clickable count).

### 2. Watchlist Page (`/watchlist`)

My personal watchlist. Accessible from the side nav ("WATCHLIST", ☆ icon).

**Layout:** Dense list rows, one artist per row, with:
- Artist name (links to `/artist/[spotifyId]`) and tier badge + listener count
- 7-bar inline sparkline (last 7 days of stream data, same bar style as dashboard roster cards)
- Momentum score (right-aligned, hidden for Underground)
- "Added N weeks ago" timestamp (right-aligned below score)

Empty state: "No artists on your watchlist yet. Add from any artist profile."

### 3. Public Label Page (`/labels/[id]`)

Publicly accessible (no auth required). Shows:
- Label name, rep tier badge, reputation points
- Their watchlist in the same dense-list-with-sparkline format
- If list is empty: "This label hasn't added any artists yet."

This page is the destination from both:
- "Watched by" label name chips on artist profiles
- Label name links on the leaderboard

### 4. Leaderboard (`/leaderboard`)

Label names in leaderboard rows become `<Link>` components pointing to `/labels/[id]`. Visual treatment: underline on hover, same color as current (no change to existing design — just wrap in a link).

### 5. Side Nav

Add nav item between CONTRACTS and HISTORY:

```
{ icon: '☆', label: 'WATCHLIST', href: '/watchlist' }
```

---

## Data Notes

- The watchlist button on the artist profile needs to know the current user's watchlist state for that artist. Fetch this server-side on the artist page (check if a `watchlists` row exists for `(current_user_id, artist_id)`).
- The 7-day sparkline reuses the same `artist_stats_daily` query already used on the dashboard roster cards — last 7 rows ordered by date.
- Momentum score for sparkline rows comes from the latest `artist_stats_daily.momentum_score`. Underground artists show `—` in place of the score (consistent with rest of game).
- `added_at` is displayed as relative time ("3w ago", "2d ago") — no exact date needed.

---

## Out of Scope

- Watchlist alerts or notifications (GDD explicitly excludes these)
- Sorting or filtering the watchlist
- Watchlist count shown on the nav icon badge
- Artist profile showing competitor *scout* counts (Veteran rep gate — separate feature)
