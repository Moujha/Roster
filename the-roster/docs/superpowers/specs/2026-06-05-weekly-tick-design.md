# Weekly Tick — Royalties + Contract Expiry

**Date:** 2026-06-05  
**Status:** Approved

## Goal

Extend `/api/royalties/weekly` to compute engagement-weighted royalties for every active contract and expire contracts that have reached their `end_date`. The tick runs automatically on a Vercel Cron schedule every Monday.

## Royalty Formula

Two artists with similar monthly listeners but different stream engagement must earn materially different royalties. The formula uses `monthly_listeners` as a reliable baseline and `daily_streams_top10` as an engagement multiplier.

```
BASE_RATE = 0.000175  (per listener per week, before split)

base_royalties         = monthly_listeners × BASE_RATE × (rev_split_label_pct / 100)

expected_weekly_streams = monthly_listeners / 4
actual_weekly_streams   = SUM(daily_streams_top10) for past 7 days — null when unavailable

engagement_multiplier   = clamp(actual / expected, 0.5, 3.0)
                        = 1.0 when actual_weekly_streams is null or expected is 0

weekly_royalties        = round(base_royalties × engagement_multiplier, 2)
```

**Reference values** at `rev_split_label_pct = 50`:

| Monthly Listeners | Weekly Streams | Multiplier | Weekly Royalties |
|-------------------|---------------|------------|-----------------|
| 100K | null | 1.0× | $8.75 |
| 100K | 12.5K (½ expected) | 0.5× | $4.38 |
| 100K | 50K (2× expected) | 2.0× | $17.50 |
| 100K | 75K+ (3×+) | 3.0× | $26.25 |
| 500K | null | 1.0× | $43.75 |

When `monthly_listeners` is null for an artist (no stats row), skip that contract — do not error.

## Tick Sequence

The POST handler executes these steps in order:

1. **Resolve stats date** — fetch the most recent `date` from `artist_stats_daily` (same as search page pattern). If no stats exist, return early with `{ processed: 0 }`.

2. **Load active contracts** — fetch all contracts where `status = 'active'`, selecting `id, label_id, artist_id, rev_split_label_pct, end_date, royalties_earned, signing_bonus, dev_spend_total, baseline_listeners`.

3. **For each contract — compute royalties:**
   - Fetch `monthly_listeners` from `artist_stats_daily` at the resolved stats date for `artist_id`
   - Fetch `daily_streams_top10` rows for the 7 days ending at stats date (`stats_date - 6` through `stats_date`)
   - Apply formula above
   - Skip contract (no error) if `monthly_listeners` is null
   - `UPDATE contracts SET royalties_earned = royalties_earned + weekly_royalties WHERE id = contract.id`
   - `UPDATE labels SET treasury = treasury + weekly_royalties WHERE id = contract.label_id`

4. **Expire contracts** — for contracts where `end_date <= tick_date` (today's date, not stats date):
   - Fetch artist `name` and `tier` from `artists`
   - Use `monthly_listeners` from the stats row already fetched at the resolved stats date for `listeners_at_end`
   - Insert into `label_history`:
     ```
     label_id             = contract.label_id
     contract_id          = contract.id
     artist_name          = artist.name
     artist_tier          = artist.tier
     listeners_at_signing = contract.baseline_listeners
     listeners_at_end     = latest monthly_listeners (or null)
     signing_bonus        = contract.signing_bonus
     total_royalties      = contract.royalties_earned  (after this tick's payment)
     total_dev_spend      = contract.dev_spend_total
     net_pnl              = total_royalties - signing_bonus - total_dev_spend
     reason               = 'natural'
     completed_at         = today
     ```
   - `UPDATE contracts SET status = 'expired' WHERE id = contract.id`

5. **Return** `{ processed: N, expired: M, date: tick_date }`

**Ordering matters:** royalties are computed before expiry check so the final week is always paid.

## Dropped Contracts

When a label manually drops an artist (future feature), the route that handles the drop writes `label_history` directly with `reason = 'dropped'` and `total_royalties` as-is (no final week payment). The weekly tick ignores `dropped` contracts.

## Cron Schedule

Add to `vercel.json`:

```json
"crons": [
  { "path": "/api/royalties/weekly", "schedule": "0 8 * * 1" }
]
```

**08:00 UTC on Mondays** — one hour after the daily stats pipeline (07:00 UTC) to ensure fresh stats are available.

Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. The existing auth check in the route handles this.

## Schema Changes

None required. All needed columns exist:
- `contracts`: `end_date`, `royalties_earned`, `dev_spend_total`, `baseline_listeners`
- `labels`: `treasury`
- `label_history`: all columns already defined
- `artist_stats_daily`: `monthly_listeners`, `daily_streams_top10`

## Files In Scope

- `src/app/api/royalties/weekly/route.ts` — full rewrite of POST handler
- `vercel.json` — add `crons` array

## Out of Scope

- Activity feed / event log (next feature)
- Label progression / game week advancement (no schema exists yet)
- Dev spend mechanics
- Manual drop-contract endpoint

## Success Criteria

- Two artists with identical `monthly_listeners` but 2× the stream data earn 2× the royalties
- A contract at `end_date` receives its final royalty payment and appears in `label_history`
- Treasury updates atomically per contract (no partial state if one contract fails)
- Cron fires weekly; manual POST with `CRON_SECRET` works for testing
- Build passes with zero TypeScript errors
