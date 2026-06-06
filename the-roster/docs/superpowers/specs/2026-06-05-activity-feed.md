# Activity Feed

**Date:** 2026-06-05  
**Status:** Approved

## Goal

Give players a live record of what's happening with their label — royalty payments, signings, contract endings, and artist tier-ups — surfaced as a dashboard widget and a full timeline page.

## Events

Four event types are captured in a new `label_events` table:

| Type | Trigger | Payload |
|------|---------|---------|
| `royalty_paid` | Weekly tick Pass 1 (per contract paid) | `{ amount: number, multiplier: number, has_stream_data: boolean }` |
| `artist_signed` | Contract signing action | `{ months: number, split_pct: number, signing_bonus: number }` |
| `contract_expired` | Weekly tick Pass 2 (at expiry) | `{ net_pnl: number, total_royalties: number, signing_bonus: number, reason: 'natural' \| 'dropped' }` |
| `tier_up` | Weekly tick Pass 3 (new) | `{ new_tier: string }` |

## Data Model

```sql
-- Migration 006
CREATE TABLE label_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id    uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  event_type  text NOT NULL
                CHECK (event_type IN ('royalty_paid','artist_signed','contract_expired','tier_up')),
  artist_name text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON label_events (label_id, created_at DESC);
```

RLS: `label_events: own label` — `FOR ALL USING (auth.uid() = label_id)`.

No `artist_id` foreign key — events are a permanent log; artists may be deleted without orphaning history.

## Where Events Are Written

### `artist_signed`
Written in `src/app/(game)/contracts/actions.tsx` immediately after a successful contract insert. Uses the session-based Supabase client (user is authenticated).

```
payload: { months: contract.term_months, split_pct: contract.rev_split_label_pct, signing_bonus: contract.signing_bonus }
```

### `royalty_paid`
Written in the weekly tick Pass 1, after both the contract and label treasury updates succeed. One event per contract processed. Uses the service role client.

```
payload: { amount: royalties, multiplier: engagementMultiplier }
```

The `multiplier` is the raw computed value (e.g. `2.0`), not the formatted string. `has_stream_data` is `true` when `actualWeeklyStreams` was non-null (i.e. real stream rows existed), `false` when the multiplier defaulted to 1.0 due to missing data.

### `contract_expired`
Written in the weekly tick Pass 2, after the status flip succeeds. Uses the service role client.

```
payload: { net_pnl: totalRoyalties - signingBonus - devSpend, total_royalties: totalRoyalties, signing_bonus: c.signing_bonus, reason: 'natural' }
```

### `tier_up` (Pass 3 — new)
Added as a third pass to the weekly tick, after Pass 2. Iterates contracts that were active at the start of the tick and were NOT expired in Pass 2 (i.e., `contracts.filter(c => !toExpire.includes(c))` using the same `contracts` array and `toExpire` set from Pass 2). For each, fetches the artist's `tier` and `tier_updated_at`. If `tier_updated_at` falls within the stats week window (`statsWeekStart ≤ tier_updated_at ≤ statsDate`), writes a `tier_up` event.

```
payload: { new_tier: artist.tier }
```

Event title shown in UI: "[Artist name] reached [tier] tier"

No old-tier tracking — `artists.tier_updated_at` tells us when it changed; `artists.tier` is the new value.

## Dashboard Widget

The dashboard layout changes from single-column (max-width 960) to a two-column grid:

```
[ Stats row — full width                                    ]
[ Active roster (flex: 1)  |  Activity widget (280px wide) ]
```

The activity widget:
- Header: "RECENT ACTIVITY" (lime tag)
- Shows last 8 events for the label, ordered by `created_at DESC`
- Each row: colored dot (by event type) + one-line description + relative time ("Mon", "Fri", "2d ago")
- No pagination — see full timeline in History

Color coding:
- `royalty_paid` → `var(--lime)` dot
- `artist_signed` → `var(--cyan)` dot
- `contract_expired` → `var(--rose)` dot
- `tier_up` → `var(--amber)` dot

One-line descriptions:
- `royalty_paid` → "Earned $X from [artist]"
- `artist_signed` → "Signed [artist] · Nmo deal"
- `contract_expired` → "Contract ended — [artist] · [+/-]$X"
- `tier_up` → "[artist] reached [tier] tier"

## Activity Timeline Page (replaces History)

`src/app/(game)/history/page.tsx` is replaced entirely. The nav item stays as "History" (no nav change needed).

Page layout:
- Eyebrow: "ACTIVITY"
- Title: "FEED" (Jersey 25)
- Events grouped by ISO week label ("Week of Jun 2, 2026"), newest first
- Each event row: type icon + title + meta line + stat/detail + timestamp

Event row details:

**royalty_paid**
- Icon: `$` in lime
- Title: "Royalty payment — [artist]"
- Meta: "Royalty · [multiplier]× engagement" (or "Royalty · no stream data" when `has_stream_data` is false)
- Stat: "+$[amount]" in lime

**artist_signed**
- Icon: `✍` in cyan
- Title: "Signed [artist]"
- Meta: "[N]-month contract · [split]% split"
- Stat: "$[bonus] signing bonus" in amber

**contract_expired**
- Icon: `✗` in rose
- Title: "Contract ended — [artist]"
- Meta: "[reason] expiry"
- P&L row: Royalties $X · Cost $X · Net P&L +/-$X

**tier_up**
- Icon: `↑` in amber
- Title: "[artist] reached [tier] tier"
- Meta: "Tier change · on your roster"
- Tier pill: "[new_tier]" in tier color

## TypeScript Type

Add to `src/lib/types.ts`:

```typescript
export type EventType = 'royalty_paid' | 'artist_signed' | 'contract_expired' | 'tier_up'

export interface LabelEvent {
  id: string
  label_id: string
  event_type: EventType
  artist_name: string
  payload: Record<string, unknown>
  created_at: string
}
```

## Files In Scope

| File | Change |
|------|--------|
| `supabase/migration_006_label_events.sql` | Create — new table + index + RLS |
| `src/lib/types.ts` | Add `LabelEvent`, `EventType` |
| `src/app/(game)/contracts/actions.tsx` | Write `artist_signed` event after signing |
| `src/app/api/royalties/weekly/route.ts` | Write `royalty_paid`, `contract_expired`, `tier_up` events |
| `src/app/(game)/dashboard/page.tsx` | Two-column layout + activity widget |
| `src/app/(game)/history/page.tsx` | Full rewrite — activity timeline |

## Out of Scope

- Push notifications or real-time updates (polling / websockets)
- Event deletion or editing
- Filtering / searching the feed
- Events for actions other than the four types above
- Backfilling historical events (feed starts from when feature ships)

## Success Criteria

- Signing an artist creates an `artist_signed` event visible in the feed immediately
- Weekly tick creates `royalty_paid` events for each paid contract
- Weekly tick creates `contract_expired` events with correct P&L
- Weekly tick detects and logs tier changes for rostered artists
- Dashboard widget shows last 8 events in the right column
- History page shows full timeline grouped by week
- RLS prevents users from seeing other labels' events
- Build passes with zero TypeScript errors
