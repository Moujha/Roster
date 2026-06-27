# Contextual Guidance System — Design Spec

## Goal

Add always-visible, context-aware guidance across all four game pages: inline action banners that update based on game state, and `ⓘ` hover tooltips on opaque metrics. No dismiss buttons, no localStorage flags, no tutorial walls.

## Architecture

### New shared component: `src/components/info-tip.tsx`

A small `ⓘ` icon that shows a one-line explanation on hover. Used inline next to any metric label.

```tsx
<InfoTip text="% change in top-10 daily streams vs. 7 days ago." />
```

Pure CSS hover — no JS state. Renders a `<span>` with `title` attribute and styled `ⓘ` glyph in `var(--cyan)`. Inline-flex so it sits flush next to label text.

### Context banners

No new component. Inline JSX following the existing pattern in the codebase (same `rgba` border + `background` style as the Monday `BUDGET UNLOCKED` chip and `LOW SIGNAL` badge). Conditional rendering based on server-side props or client-side state already available on each page.

---

## Dashboard (`src/app/(game)/dashboard/page.tsx`)

### 1. Empty roster banner
Replaces the bare `"Your roster is empty"` text with a lime-bordered banner linking to `/search`:

> **SIGN YOUR FIRST ARTIST** — Find one on Search to start earning royalties. `SEARCH →`

Condition: `active.length === 0`

### 2. Monday chip upgrade
The existing `"BUDGET UNLOCKED"` chip gains an `"ALLOCATE NOW →"` link to `/contracts`. Only shown when at least one active contract has `playlist_tier = 'none'` AND `social_push_tier = 'none'` (i.e. budget is genuinely unallocated).

Requires: fetch `dev_allocations` for active contract IDs in the dashboard server query, pass `hasUnallocatedBudget: boolean` to the client component.

### 3. Breaking alert banner
When the most recent `label_events` row with `event_type = 'breaking_alert'` is within 48 hours, render a prominent inline banner above the roster:

> **BREAKING ALERT** — {artist_name} is surging this week. `VIEW →` (links to `/artist/{spotify_id}`)

Requires: fetch the latest breaking_alert event and the artist's `spotify_id` in the dashboard server query. The 48-hour window matches the data lag — stale alerts don't show. Window check: `new Date(event.created_at) > new Date(Date.now() - 48 * 3600_000)`.

### 4. InfoTips on stat labels
- **TREASURY** ⓘ — `"Your starting capital. Grows with royalties, shrinks with signing bonuses and dev spend."`
- **WEEKLY INCOME** ⓘ — `"Estimated weekly royalties from active contracts, before development spend."`
- **REPUTATION** ⓘ — `"Unlocks better data at 250 pts (Established) and deeper insights at 600 pts (Veteran). Grows when contracts complete naturally."`

### 5. Reputation progress sub-label
Below the reputation number, show distance to next tier:
- `< 250` → `"{250 - rep} PTS TO ESTABLISHED"`
- `250–599` → `"{600 - rep} PTS TO VETERAN"`
- `≥ 600` → nothing (already Veteran)

---

## Artist profile (`src/app/(game)/artist/[spotifyId]/client.tsx`)

### 1. Momentum ⓘ — always-on
Remove the `localStorage` gate (`roster_momentum_tooltip_seen`). Replace with a persistent `<InfoTip>` alongside the `MOMENTUM` label:
- Text: `"Combines streaming growth, listener momentum, and catalog depth. Higher = more heat right now."`

The `showMomentumTooltip` state and the `useEffect` that sets it can be deleted entirely.

### 2. Metric ⓘ tooltips (Established+ only)
These sit alongside the labels in the metrics row, rendered only when `labelReputation >= 250`:
- **7D VELOCITY** ⓘ — `"% change in top-10 daily streams vs. 7 days ago. Primary momentum signal."`
- **CATALOG DEPTH** ⓘ — `"How evenly streams spread across top 10 tracks. Higher = more durable audience, less reliance on one hit."`
- **STREAMS/LISTENER** ⓘ — `"Daily streams ÷ monthly listeners. Above 0.15 signals a highly engaged fanbase."`

### 3. Scout nudge banner
Shown when: no active scout on this artist (`!scout`) AND no active contract (`!contract`).

```
SCOUT FOR DETAILED INTEL
A scout report reveals negotiation priorities and a precise bonus estimate — before you make an offer.
                                                                                          DEPLOY →
```

Cyan border, links to the deploy scout button (scroll or focus). Disappears immediately once a scout is deployed or a contract exists — both conditions are already available as props.

### 4. Signal tags block removed
The `buildSignalTags` function output (the row of `"Signed by N labels"`, `"+18% velocity this week"` chips rendered below the stats) is removed. The same data is already prominently displayed in the metrics row and the stats grid above.

---

## Contracts / dev panel (`src/app/(game)/contracts/dev-alloc.tsx`)

### 1. Monday nudge on DEVELOP button
When `playlist === 'none' && social === 'none'` and `new Date().getDay() === 1` (Monday), show a `"BUDGET AVAILABLE"` chip next to the `DEVELOP ▼` label. Computed client-side — no prop needed.

### 2. ⓘ on section labels
Three `<InfoTip>` additions inside the open panel:

- **PLAYLIST PITCHING** ⓘ — `"Boosts total stream volume for 7 days. Multiplier applies to your royalty calculation. Re-allocate each Monday to keep it active."`
- **SOCIAL PUSH** ⓘ — `"Sets a floor on how far streams can drop week-over-week. Doesn't boost revenue — it protects against decline. Use when momentum is at risk."`
- **RELEASE AMPLIFICATION** ⓘ — `"One-time treasury spend when a new track drops. Peaks immediately and decays to 1× over 14 days. Stacks with playlist pitching up to the 1.60× hard cap."`

---

## Search page (`src/app/(game)/search/page.tsx`)

### 1. Empty roster banner
When `activeContractCount === 0` and no search query is active, show a single inline banner above the on-ramps:

> **START HERE** — Browse the picks below or search by name. Sign your first artist to start earning royalties.

Requires: fetch active contract count in the page's server query (already fetches `scouts` — add a contract count in the same `Promise.all`). Banner disappears once the player has one active contract.

---

## What this does not change

- Onboarding flow — already complete (Steps 1–4, 4-step wizard, post-signing memo)
- Activity feed on dashboard — breaking alerts already appear there; the new banner surfaces the most urgent one prominently
- Contract expiry screen — already implemented
- Any localStorage-based one-time flows other than the Momentum tooltip (which is replaced)
