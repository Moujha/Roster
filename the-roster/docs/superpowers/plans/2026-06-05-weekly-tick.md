# Weekly Tick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/api/royalties/weekly` to pay engagement-weighted royalties to every active contract, expire contracts past their end date, and schedule the tick automatically via Vercel Cron.

**Architecture:** Pure royalty logic is extracted into `src/lib/royalty.ts` for unit testing. The route handler orchestrates two DB passes: (1) compute + pay royalties for all active contracts, (2) expire contracts past `end_date`. A service role Supabase client is used so RLS does not block the cron job.

**Tech Stack:** Next.js 16 Route Handler, Supabase JS v2, Vitest, Vercel Cron

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/royalty.ts` | Create | Pure royalty calculation functions |
| `src/lib/royalty.test.ts` | Create | Unit tests for those functions |
| `src/lib/supabase/service.ts` | Create | Service role Supabase client (bypasses RLS) |
| `src/app/api/royalties/weekly/route.ts` | Rewrite | Full tick: royalties pass + expiry pass |
| `vercel.json` | Modify | Add `crons` config |
| `package.json` | Modify | Add `test` script |
| `vitest.config.ts` | Create | Vitest config |

---

## Task 1: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

```bash
cd /path/to/the-roster
npm install --save-dev vitest
```

Expected: vitest appears in `devDependencies` in `package.json`.

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts` at the repo root (`the-roster/vitest.config.ts`):

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add test script to package.json**

In `package.json`, add `"test": "vitest run"` to the `scripts` object:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Verify setup works**

```bash
npm test
```

Expected output: `No test files found` (or similar — no errors, just nothing to run yet).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit tests"
```

---

## Task 2: Royalty helper — pure functions + tests

**Files:**
- Create: `src/lib/royalty.ts`
- Create: `src/lib/royalty.test.ts`

### Context

The royalty formula:
```
BASE_RATE = 0.000175  (per listener per week, before split)

base = monthly_listeners × BASE_RATE × (rev_split_label_pct / 100)

expected_weekly_streams = monthly_listeners / 4
engagement_multiplier   = clamp(actual_weekly_streams / expected, 0.5, 3.0)
                        = 1.0 when actual_weekly_streams is null OR expected is 0

weekly_royalties = round(base × multiplier, 2)
```

### Steps

- [ ] **Step 1: Write the failing tests**

Create `src/lib/royalty.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeEngagementMultiplier, computeWeeklyRoyalties } from './royalty'

describe('computeEngagementMultiplier', () => {
  it('returns 1.0 when actualWeeklyStreams is null', () => {
    expect(computeEngagementMultiplier(100_000, null)).toBe(1.0)
  })

  it('returns 1.0 when monthlyListeners is 0 (avoids divide-by-zero)', () => {
    expect(computeEngagementMultiplier(0, 10_000)).toBe(1.0)
  })

  it('returns ratio when within [0.5, 3.0]', () => {
    // expected = 100K / 4 = 25K; actual = 50K → ratio = 2.0
    expect(computeEngagementMultiplier(100_000, 50_000)).toBe(2.0)
  })

  it('clamps to 0.5 for low engagement', () => {
    // expected = 25K; actual = 1K → ratio = 0.04 → clamped to 0.5
    expect(computeEngagementMultiplier(100_000, 1_000)).toBe(0.5)
  })

  it('clamps to 3.0 for very high engagement', () => {
    // expected = 25K; actual = 200K → ratio = 8.0 → clamped to 3.0
    expect(computeEngagementMultiplier(100_000, 200_000)).toBe(3.0)
  })
})

describe('computeWeeklyRoyalties', () => {
  it('computes baseline with null streams (multiplier = 1.0)', () => {
    // 100K × 0.000175 × 0.5 × 1.0 = 8.75
    expect(computeWeeklyRoyalties(100_000, 50, null)).toBe(8.75)
  })

  it('doubles royalties for 2× engagement', () => {
    // multiplier = 2.0 → 8.75 × 2 = 17.50
    expect(computeWeeklyRoyalties(100_000, 50, 50_000)).toBe(17.5)
  })

  it('caps at 3× for extreme engagement', () => {
    // multiplier = 3.0 → 8.75 × 3 = 26.25
    expect(computeWeeklyRoyalties(100_000, 50, 200_000)).toBe(26.25)
  })

  it('applies rev split correctly', () => {
    // 100K × 0.000175 × 0.25 = 4.375 → rounded to 4.38
    expect(computeWeeklyRoyalties(100_000, 25, null)).toBe(4.38)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: 9 failing tests with `Cannot find module './royalty'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/royalty.ts`:

```typescript
export const BASE_RATE = 0.000175

export function computeEngagementMultiplier(
  monthlyListeners: number,
  actualWeeklyStreams: number | null,
): number {
  if (actualWeeklyStreams === null || monthlyListeners === 0) return 1.0
  const expected = monthlyListeners / 4
  return Math.min(3.0, Math.max(0.5, actualWeeklyStreams / expected))
}

export function computeWeeklyRoyalties(
  monthlyListeners: number,
  revSplitLabelPct: number,
  actualWeeklyStreams: number | null,
): number {
  const base = monthlyListeners * BASE_RATE * (revSplitLabelPct / 100)
  const multiplier = computeEngagementMultiplier(monthlyListeners, actualWeeklyStreams)
  return Math.round(base * multiplier * 100) / 100
}
```

- [ ] **Step 4: Run tests — verify they all pass**

```bash
npm test
```

Expected: `9 passed` with no failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/royalty.ts src/lib/royalty.test.ts
git commit -m "feat: add engagement-weighted royalty helpers with tests"
```

---

## Task 3: Service role Supabase client

**Files:**
- Create: `src/lib/supabase/service.ts`

### Context

The weekly route runs via Vercel Cron — no browser session, no cookies. The session-based `createClient` in `server.ts` calls `auth.uid()` → null, which causes all RLS policies (e.g. `contracts: own label` requires `auth.uid() = label_id`) to block every query. The service role key bypasses RLS entirely and is appropriate for server-side cron jobs.

The env var `SUPABASE_SERVICE_ROLE_KEY` must exist in Vercel environment variables. Find it in: Supabase dashboard → Project Settings → API → `service_role` key. Add it to Vercel as a non-public env var (no `NEXT_PUBLIC_` prefix).

- [ ] **Step 1: Create the service client**

Create `src/lib/supabase/service.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/service.ts
git commit -m "feat: add service role supabase client for cron routes"
```

---

## Task 4: Rewrite the weekly tick route

**Files:**
- Modify: `src/app/api/royalties/weekly/route.ts` (full rewrite)

### Context

Current file location: `src/app/api/royalties/weekly/route.ts`

The current implementation (50 lines) uses `daily_streams_top10` as the sole royalty basis and skips contracts with zero streams. Replace it entirely with the two-pass logic below.

**Pass 1 — Royalties:** for each active contract, fetch `monthly_listeners` at the resolved stats date, sum `daily_streams_top10` for the preceding 7 days, compute royalties via `computeWeeklyRoyalties`, and update `contracts.royalties_earned` + `labels.treasury`.

**Pass 2 — Expiry:** for all active contracts where `end_date <= today`, fetch fresh `royalties_earned` (after pass 1), insert into `label_history`, and set `status = 'expired'`.

Stats date is the most recent row in `artist_stats_daily` (pipeline may lag a day).

- [ ] **Step 1: Rewrite route.ts**

Replace the entire contents of `src/app/api/royalties/weekly/route.ts` with:

```typescript
import { createServiceClient } from '@/lib/supabase/service'
import { computeWeeklyRoyalties } from '@/lib/royalty'

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  // Resolve most recent stats date (pipeline may lag)
  const { data: latestRow } = await supabase
    .from('artist_stats_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const statsDate = latestRow?.date
  if (!statsDate) return Response.json({ processed: 0, expired: 0, date: today })

  const statsWeekStart = new Date(
    new Date(statsDate + 'T00:00:00Z').getTime() - 6 * 86400_000,
  ).toISOString().slice(0, 10)

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, label_id, artist_id, rev_split_label_pct, end_date, signing_bonus, dev_spend_total, baseline_listeners')
    .eq('status', 'active')

  if (!contracts?.length) return Response.json({ processed: 0, expired: 0, date: today })

  // artist_id → monthly_listeners at statsDate, used in expiry pass
  const listenersMap = new Map<string, number>()
  let processed = 0

  // ── Pass 1: compute and pay royalties ────────────────────────────────────────
  for (const c of contracts) {
    const { data: statsRow } = await supabase
      .from('artist_stats_daily')
      .select('monthly_listeners')
      .eq('artist_id', c.artist_id)
      .eq('date', statsDate)
      .maybeSingle()

    if (!statsRow?.monthly_listeners) continue

    listenersMap.set(c.artist_id, statsRow.monthly_listeners)

    const { data: streamRows } = await supabase
      .from('artist_stats_daily')
      .select('daily_streams_top10')
      .eq('artist_id', c.artist_id)
      .gte('date', statsWeekStart)
      .lte('date', statsDate)
      .not('daily_streams_top10', 'is', null)

    const actualWeeklyStreams = streamRows?.length
      ? streamRows.reduce((sum, r) => sum + (r.daily_streams_top10 ?? 0), 0)
      : null

    const royalties = computeWeeklyRoyalties(
      statsRow.monthly_listeners,
      c.rev_split_label_pct,
      actualWeeklyStreams,
    )

    const [{ data: contract }, { data: label }] = await Promise.all([
      supabase.from('contracts').select('royalties_earned').eq('id', c.id).single(),
      supabase.from('labels').select('treasury').eq('id', c.label_id).single(),
    ])

    await Promise.all([
      supabase.from('contracts')
        .update({ royalties_earned: (contract?.royalties_earned ?? 0) + royalties })
        .eq('id', c.id),
      supabase.from('labels')
        .update({ treasury: (label?.treasury ?? 0) + royalties })
        .eq('id', c.label_id),
    ])

    processed++
  }

  // ── Pass 2: expire contracts past end_date ───────────────────────────────────
  const toExpire = contracts.filter(c => c.end_date <= today)
  let expired = 0

  for (const c of toExpire) {
    const [{ data: contract }, { data: artist }] = await Promise.all([
      supabase.from('contracts').select('royalties_earned').eq('id', c.id).single(),
      supabase.from('artists').select('name, tier').eq('id', c.artist_id).single(),
    ])

    const totalRoyalties = contract?.royalties_earned ?? 0

    await Promise.all([
      supabase.from('label_history').insert({
        label_id: c.label_id,
        contract_id: c.id,
        artist_name: artist?.name ?? 'Unknown',
        artist_tier: artist?.tier ?? 'underground',
        listeners_at_signing: c.baseline_listeners,
        listeners_at_end: listenersMap.get(c.artist_id) ?? null,
        signing_bonus: c.signing_bonus,
        total_royalties: totalRoyalties,
        total_dev_spend: c.dev_spend_total,
        net_pnl: totalRoyalties - c.signing_bonus - c.dev_spend_total,
        reason: 'natural',
        completed_at: today,
      }),
      supabase.from('contracts').update({ status: 'expired' }).eq('id', c.id),
    ])

    expired++
  }

  return Response.json({ processed, expired, date: today })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build completes with no type errors. Ignore any Supabase type warnings about column names — the project does not use generated DB types.

- [ ] **Step 3: Test the endpoint manually**

First, add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` to your local `.env.local` if not already present. `CRON_SECRET` can be any string for local testing.

```bash
curl -X POST http://localhost:3000/api/royalties/weekly \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE"
```

Expected response (numbers will vary):
```json
{ "processed": 3, "expired": 0, "date": "2026-06-05" }
```

If `processed` is 0, check:
1. Are there active contracts in the DB? (`select * from contracts where status = 'active'`)
2. Does `artist_stats_daily` have rows? (`select max(date) from artist_stats_daily`)
3. Is `SUPABASE_SERVICE_ROLE_KEY` set correctly?

- [ ] **Step 4: Verify a contract with end_date in the past gets expired**

In Supabase SQL Editor, temporarily set one contract's `end_date` to yesterday:

```sql
UPDATE contracts
SET end_date = current_date - 1
WHERE status = 'active'
LIMIT 1;
```

Trigger the tick again:

```bash
curl -X POST http://localhost:3000/api/royalties/weekly \
  -H "Authorization: Bearer YOUR_CRON_SECRET_HERE"
```

Expected: `{ "processed": N, "expired": 1, "date": "..." }`

Verify in Supabase:
```sql
SELECT status FROM contracts WHERE end_date < current_date;
-- Expected: 'expired'

SELECT * FROM label_history ORDER BY completed_at DESC LIMIT 1;
-- Expected: one row with reason = 'natural', correct net_pnl
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/royalties/weekly/route.ts
git commit -m "feat: rewrite weekly tick with engagement-weighted royalties and contract expiry"
```

---

## Task 5: Add Vercel Cron schedule

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add crons to vercel.json**

Replace the contents of `vercel.json` with:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "crons": [
    { "path": "/api/royalties/weekly", "schedule": "0 8 * * 1" }
  ]
}
```

`0 8 * * 1` = every Monday at 08:00 UTC (one hour after the daily stats pipeline at 07:00 UTC).

- [ ] **Step 2: Verify CRON_SECRET is set in Vercel**

In the Vercel dashboard → Project → Settings → Environment Variables, confirm `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are both set for the Production environment.

Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET` when it invokes the route.

- [ ] **Step 3: Deploy and verify cron appears**

```bash
git add vercel.json
git commit -m "feat: schedule weekly tick via vercel cron (mondays 08:00 utc)"
```

Push to the deployment branch. After deploy, go to Vercel dashboard → Project → Cron Jobs. Confirm `/api/royalties/weekly` appears with schedule `0 8 * * 1`.

- [ ] **Step 4: Trigger one manual run from Vercel**

In Vercel dashboard → Cron Jobs → click "Run Now" next to the weekly tick cron. Verify the invocation log shows a `200` response and the JSON payload has `processed` and `expired` counts.
