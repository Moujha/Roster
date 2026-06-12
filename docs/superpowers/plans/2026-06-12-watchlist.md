# Watchlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Watchlist feature (GDD §9.3) — a publicly visible, timestamped curation tool where players save artists to track before signing.

**Architecture:** New `watchlists` DB table + 3 API routes + 2 new pages (`/watchlist`, `/labels/[id]`) + additions to the artist profile and leaderboard. Server components query Supabase directly; client-side toggle mutations use fetch calls to the API routes.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Vitest

---

### Task 1: DB migration + types

**Files:**
- Create: `the-roster/supabase/migration_012_watchlists.sql`
- Modify: `the-roster/src/lib/types.ts`

- [ ] **Step 1: Write migration file**

```sql
-- Migration 012 — Watchlist table (GDD §9.3)

CREATE TABLE watchlists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id   uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  artist_id  uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (label_id, artist_id)
);

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read any watchlist (public visibility per GDD §9.3)
CREATE POLICY "watchlists: readable by all authenticated" ON watchlists
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only insert/delete their own rows
CREATE POLICY "watchlists: own label insert" ON watchlists
  FOR INSERT WITH CHECK (auth.uid() = label_id);

CREATE POLICY "watchlists: own label delete" ON watchlists
  FOR DELETE USING (auth.uid() = label_id);
```

- [ ] **Step 2: Run migration in Supabase dashboard**

Open the Supabase SQL editor, paste the contents of `migration_012_watchlists.sql`, and run it. Verify the `watchlists` table appears in the Table Editor with the expected columns.

- [ ] **Step 3: Add WatchlistEntry type to `src/lib/types.ts`**

Add after the `Scout` interface:

```typescript
export interface WatchlistEntry {
  id: string
  label_id: string
  artist_id: string
  added_at: string
}
```

- [ ] **Step 4: Commit**

```bash
git add the-roster/supabase/migration_012_watchlists.sql the-roster/src/lib/types.ts
git commit -m "feat: watchlist DB migration and type"
```

---

### Task 2: `fmtRelativeTime` utility (TDD)

**Files:**
- Modify: `the-roster/src/lib/utils.ts`
- Create: `the-roster/src/lib/utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `the-roster/src/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { fmtRelativeTime } from './utils'

describe('fmtRelativeTime', () => {
  it('returns "today" for timestamps within the last 24h', () => {
    const now = new Date().toISOString()
    expect(fmtRelativeTime(now)).toBe('today')
  })

  it('returns "1d ago" for ~1 day ago', () => {
    const d = new Date(Date.now() - 1.5 * 86400_000).toISOString()
    expect(fmtRelativeTime(d)).toBe('1d ago')
  })

  it('returns "6d ago" for ~6 days ago', () => {
    const d = new Date(Date.now() - 6 * 86400_000).toISOString()
    expect(fmtRelativeTime(d)).toBe('6d ago')
  })

  it('returns "1w ago" for ~1 week ago', () => {
    const d = new Date(Date.now() - 8 * 86400_000).toISOString()
    expect(fmtRelativeTime(d)).toBe('1w ago')
  })

  it('returns "4w ago" for ~4 weeks ago', () => {
    const d = new Date(Date.now() - 29 * 86400_000).toISOString()
    expect(fmtRelativeTime(d)).toBe('4w ago')
  })

  it('returns "2mo ago" for ~2 months ago', () => {
    const d = new Date(Date.now() - 65 * 86400_000).toISOString()
    expect(fmtRelativeTime(d)).toBe('2mo ago')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd the-roster && npx vitest run src/lib/utils.test.ts
```

Expected: FAIL — `fmtRelativeTime is not a function`

- [ ] **Step 3: Implement `fmtRelativeTime` in `src/lib/utils.ts`**

Add after the existing `cn` function:

```typescript
export function fmtRelativeTime(isoString: string): string {
  const days = Math.floor((Date.now() - new Date(isoString).getTime()) / 86400_000)
  if (days < 1)  return 'today'
  if (days < 7)  return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd the-roster && npx vitest run src/lib/utils.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add the-roster/src/lib/utils.ts the-roster/src/lib/utils.test.ts
git commit -m "feat: fmtRelativeTime utility"
```

---

### Task 3: API mutations — add and remove from watchlist

**Files:**
- Create: `the-roster/src/app/api/watchlist/route.ts`
- Create: `the-roster/src/app/api/watchlist/[artistId]/route.ts`

- [ ] **Step 1: Create `src/app/api/watchlist/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { artist_id } = body
  if (!artist_id) return Response.json({ error: 'artist_id required' }, { status: 400 })

  const { data: artist } = await supabase
    .from('artists').select('id').eq('id', artist_id).maybeSingle()
  if (!artist) return Response.json({ error: 'Artist not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('watchlists')
    .upsert({ label_id: user.id, artist_id }, { onConflict: 'label_id,artist_id', ignoreDuplicates: true })
    .select('added_at')
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, added_at: data?.added_at ?? new Date().toISOString() })
}
```

- [ ] **Step 2: Create `src/app/api/watchlist/[artistId]/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ artistId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { artistId } = await params

  const { error } = await supabase
    .from('watchlists')
    .delete()
    .eq('label_id', user.id)
    .eq('artist_id', artistId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add the-roster/src/app/api/watchlist/
git commit -m "feat: watchlist add/remove API routes"
```

---

### Task 4: API — public label watchlist

**Files:**
- Create: `the-roster/src/app/api/labels/[labelId]/watchlist/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ labelId: string }> }
) {
  const supabase = createServiceClient()
  const { labelId } = await params

  const { data: label } = await supabase
    .from('labels')
    .select('id, label_name, reputation')
    .eq('id', labelId)
    .maybeSingle()

  if (!label) return Response.json({ error: 'Label not found' }, { status: 404 })

  const { data: entries } = await supabase
    .from('watchlists')
    .select('id, added_at, artist_id, artists(id, name, tier, spotify_id)')
    .eq('label_id', labelId)
    .order('added_at', { ascending: false })

  const artistIds = (entries ?? []).map((e: { artist_id: string }) => e.artist_id)

  let statsMap: Map<string, { monthly_listeners: number | null; momentum_score: number | null; spark: (number | null)[] }> = new Map()

  if (artistIds.length > 0) {
    const { data: statsRows } = await supabase
      .from('artist_stats_daily')
      .select('artist_id, date, daily_streams_top10, momentum_score, monthly_listeners')
      .in('artist_id', artistIds)
      .order('date', { ascending: false })
      .limit(artistIds.length * 8)

    const grouped = new Map<string, typeof statsRows>()
    for (const row of (statsRows ?? [])) {
      if (!grouped.has(row.artist_id)) grouped.set(row.artist_id, [])
      grouped.get(row.artist_id)!.push(row)
    }
    for (const [id, rows] of grouped) {
      const top7 = rows.slice(0, 7)
      statsMap.set(id, {
        monthly_listeners: top7[0]?.monthly_listeners ?? null,
        momentum_score: top7[0]?.momentum_score ?? null,
        spark: [...top7].reverse().map(r => r.daily_streams_top10 ?? null),
      })
    }
  }

  const watchlist = (entries ?? []).map((e: {
    id: string; added_at: string; artist_id: string;
    artists: { id: string; name: string; tier: string; spotify_id: string } | null
  }) => ({
    id: e.id,
    added_at: e.added_at,
    artist: e.artists,
    stats: statsMap.get(e.artist_id) ?? null,
  }))

  return Response.json({ label, watchlist })
}
```

- [ ] **Step 2: Commit**

```bash
git add the-roster/src/app/api/labels/
git commit -m "feat: public label watchlist API route"
```

---

### Task 5: My Watchlist page

**Files:**
- Create: `the-roster/src/app/(game)/watchlist/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { fmtRelativeTime } from '@/lib/utils'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function fmtListeners(n: number | null) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default async function WatchlistPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: entries } = await supabase
    .from('watchlists')
    .select('id, added_at, artist_id, artists(id, name, tier, spotify_id)')
    .eq('label_id', user.id)
    .order('added_at', { ascending: false })

  const artistIds = (entries ?? []).map((e: { artist_id: string }) => e.artist_id)

  const statsMap = new Map<string, {
    monthly_listeners: number | null
    momentum_score: number | null
    spark: (number | null)[]
  }>()

  if (artistIds.length > 0) {
    const { data: statsRows } = await supabase
      .from('artist_stats_daily')
      .select('artist_id, date, daily_streams_top10, momentum_score, monthly_listeners')
      .in('artist_id', artistIds)
      .order('date', { ascending: false })
      .limit(artistIds.length * 8)

    const grouped = new Map<string, typeof statsRows>()
    for (const row of (statsRows ?? [])) {
      if (!grouped.has(row.artist_id)) grouped.set(row.artist_id, [])
      grouped.get(row.artist_id)!.push(row)
    }
    for (const [id, rows] of grouped) {
      const top7 = (rows ?? []).slice(0, 7)
      statsMap.set(id, {
        monthly_listeners: top7[0]?.monthly_listeners ?? null,
        momentum_score: top7[0]?.momentum_score ?? null,
        spark: [...top7].reverse().map((r: { daily_streams_top10: number | null }) => r.daily_streams_top10 ?? null),
      })
    }
  }

  const rows = (entries ?? []) as {
    id: string; added_at: string; artist_id: string;
    artists: { id: string; name: string; tier: string; spotify_id: string } | null
  }[]

  return (
    <div style={{ padding: 24, maxWidth: 760, fontFamily: 'Inter, sans-serif', color: 'var(--ink)' }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>WATCHLIST</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 24 }}>YOUR ARTISTS</div>

      {rows.length === 0 ? (
        <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>
          No artists on your watchlist yet.{' '}
          <Link href="/search" style={{ color: 'var(--lime)' }}>Find artists</Link> and add them from their profile page.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          {rows.map(entry => {
            const artist = entry.artists
            if (!artist) return null
            const s = statsMap.get(entry.artist_id)
            const tierColor = TIER_COLORS[artist.tier] ?? 'var(--ink-mid)'
            const validSpark = s?.spark ?? []
            const maxSpark = Math.max(...validSpark.filter((v): v is number => v != null), 1)
            const isUnderground = artist.tier === 'underground'

            return (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderBottom: '1px solid var(--line-soft)',
              }}>
                {/* Artist info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/artist/${artist.spotify_id}`} style={{ color: 'var(--ink-hi)', fontSize: 13, textDecoration: 'none' }}>
                    {artist.name}
                  </Link>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                    <span className="tag" style={{ color: tierColor, fontSize: 8 }}>{artist.tier.toUpperCase()}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{fmtListeners(s?.monthly_listeners ?? null)}</span>
                  </div>
                </div>

                {/* Sparkline */}
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20, flexShrink: 0 }}>
                  {validSpark.length > 0
                    ? validSpark.map((v, i) => {
                        const h = v != null ? Math.max(2, Math.round((v / maxSpark) * 20)) : 2
                        return <div key={i} style={{ width: 5, height: h, background: v != null ? 'var(--lime)' : 'var(--bg-tile)', flexShrink: 0 }} />
                      })
                    : Array.from({ length: 7 }, (_, i) => (
                        <div key={i} style={{ width: 5, height: 2, background: 'var(--bg-tile)' }} />
                      ))
                  }
                </div>

                {/* Score + date */}
                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 48 }}>
                  {!isUnderground && s?.momentum_score != null
                    ? <div className="tag" style={{ color: 'var(--lime)', fontSize: 12 }}>{Math.round(s.momentum_score)}</div>
                    : <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 12 }}>—</div>
                  }
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>
                    {fmtRelativeTime(entry.added_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add WATCHLIST to the nav in `src/app/(game)/nav.tsx`**

Find `NAV_ITEMS` and add after CONTRACTS:

```typescript
const NAV_ITEMS = [
  { icon: '◼', label: 'LABEL HQ',    href: '/dashboard' },
  { icon: '◆', label: 'SEARCH',      href: '/search' },
  { icon: '$', label: 'CONTRACTS',   href: '/contracts' },
  { icon: '☆', label: 'WATCHLIST',   href: '/watchlist' },
  { icon: '◉', label: 'HISTORY',     href: '/history' },
  { icon: '▲', label: 'LEADERBOARD', href: '/leaderboard' },
]
```

- [ ] **Step 3: Verify page renders**

Start dev server (`npm run dev`) and navigate to `/watchlist`. With an empty watchlist, expect the empty state message. No console errors.

- [ ] **Step 4: Commit**

```bash
git add the-roster/src/app/\(game\)/watchlist/ the-roster/src/app/\(game\)/nav.tsx
git commit -m "feat: watchlist page and nav item"
```

---

### Task 6: Public label page

**Files:**
- Create: `the-roster/src/app/(game)/labels/[labelId]/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fmtRelativeTime } from '@/lib/utils'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function fmtListeners(n: number | null) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function repTier(rep: number) {
  if (rep < 250) return { label: 'NEW LABEL',   color: 'var(--ink-mid)' }
  if (rep < 600) return { label: 'ESTABLISHED', color: 'var(--cyan)' }
  return              { label: 'VETERAN',       color: 'var(--amber)' }
}

export default async function PublicLabelPage({
  params,
}: {
  params: Promise<{ labelId: string }>
}) {
  const { labelId } = await params
  const supabase = createServiceClient()

  const { data: label } = await supabase
    .from('labels')
    .select('id, label_name, reputation')
    .eq('id', labelId)
    .maybeSingle()

  if (!label) notFound()

  const { data: entries } = await supabase
    .from('watchlists')
    .select('id, added_at, artist_id, artists(id, name, tier, spotify_id)')
    .eq('label_id', labelId)
    .order('added_at', { ascending: false })

  const artistIds = (entries ?? []).map((e: { artist_id: string }) => e.artist_id)
  const statsMap = new Map<string, {
    monthly_listeners: number | null
    momentum_score: number | null
    spark: (number | null)[]
  }>()

  if (artistIds.length > 0) {
    const { data: statsRows } = await supabase
      .from('artist_stats_daily')
      .select('artist_id, date, daily_streams_top10, momentum_score, monthly_listeners')
      .in('artist_id', artistIds)
      .order('date', { ascending: false })
      .limit(artistIds.length * 8)

    const grouped = new Map<string, typeof statsRows>()
    for (const row of (statsRows ?? [])) {
      if (!grouped.has(row.artist_id)) grouped.set(row.artist_id, [])
      grouped.get(row.artist_id)!.push(row)
    }
    for (const [id, rows] of grouped) {
      const top7 = (rows ?? []).slice(0, 7)
      statsMap.set(id, {
        monthly_listeners: top7[0]?.monthly_listeners ?? null,
        momentum_score: top7[0]?.momentum_score ?? null,
        spark: [...top7].reverse().map((r: { daily_streams_top10: number | null }) => r.daily_streams_top10 ?? null),
      })
    }
  }

  const rows = (entries ?? []) as {
    id: string; added_at: string; artist_id: string;
    artists: { id: string; name: string; tier: string; spotify_id: string } | null
  }[]

  const tier = repTier(label.reputation)

  return (
    <div style={{ padding: 24, maxWidth: 760, fontFamily: 'Inter, sans-serif', color: 'var(--ink)' }}>
      {/* Label header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, background: tier.color, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Inter, sans-serif', color: '#100719', fontSize: 14, fontWeight: 800,
        }}>
          {label.label_name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="display" style={{ fontSize: 24, color: 'var(--ink-hi)' }}>{label.label_name}</div>
          <div className="tag" style={{ color: tier.color, fontSize: 9 }}>
            {tier.label} · {label.reputation} PTS
          </div>
        </div>
      </div>

      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 12 }}>WATCHLIST</div>

      {rows.length === 0 ? (
        <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>This label hasn&apos;t added any artists yet.</div>
      ) : (
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          {rows.map(entry => {
            const artist = entry.artists
            if (!artist) return null
            const s = statsMap.get(entry.artist_id)
            const tierColor = TIER_COLORS[artist.tier] ?? 'var(--ink-mid)'
            const validSpark = s?.spark ?? []
            const maxSpark = Math.max(...validSpark.filter((v): v is number => v != null), 1)
            const isUnderground = artist.tier === 'underground'

            return (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderBottom: '1px solid var(--line-soft)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/artist/${artist.spotify_id}`} style={{ color: 'var(--ink-hi)', fontSize: 13, textDecoration: 'none' }}>
                    {artist.name}
                  </Link>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                    <span className="tag" style={{ color: tierColor, fontSize: 8 }}>{artist.tier.toUpperCase()}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{fmtListeners(s?.monthly_listeners ?? null)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20, flexShrink: 0 }}>
                  {validSpark.length > 0
                    ? validSpark.map((v, i) => {
                        const h = v != null ? Math.max(2, Math.round((v / maxSpark) * 20)) : 2
                        return <div key={i} style={{ width: 5, height: h, background: v != null ? 'var(--lime)' : 'var(--bg-tile)', flexShrink: 0 }} />
                      })
                    : Array.from({ length: 7 }, (_, i) => (
                        <div key={i} style={{ width: 5, height: 2, background: 'var(--bg-tile)' }} />
                      ))
                  }
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 48 }}>
                  {!isUnderground && s?.momentum_score != null
                    ? <div className="tag" style={{ color: 'var(--lime)', fontSize: 12 }}>{Math.round(s.momentum_score)}</div>
                    : <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 12 }}>—</div>
                  }
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>
                    {fmtRelativeTime(entry.added_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the page builds**

```bash
cd the-roster && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add the-roster/src/app/\(game\)/labels/
git commit -m "feat: public label watchlist page"
```

---

### Task 7: Artist profile — watchlist toggle + "Watched by" section

**Files:**
- Modify: `the-roster/src/app/(game)/artist/[spotifyId]/page.tsx`
- Modify: `the-roster/src/app/(game)/artist/[spotifyId]/client.tsx`

- [ ] **Step 1: Add watchlist data fetches in `page.tsx`**

In `page.tsx`, expand the `Promise.all` to include two new queries. Find the existing `Promise.all` block (the one with `statsRes`, `sparkRes`, etc.) and add two new entries:

```typescript
const [statsRes, sparkRes, countRes, labelRes, scoutRes, stats14Res, activeScoutCountRes, watchingRes, watchersRes] = await Promise.all([
  supabase.from('artist_stats_daily').select('*').eq('artist_id', artist.id)
    .order('date', { ascending: false }).limit(1).maybeSingle(),
  supabase.from('artist_stats_daily').select('date, daily_streams_top10')
    .eq('artist_id', artist.id).order('date', { ascending: false }).limit(7),
  supabase.from('contracts').select('*', { count: 'exact', head: true })
    .eq('artist_id', artist.id).eq('status', 'active'),
  supabase.from('labels').select('treasury, id').eq('id', user.id).single(),
  supabase.from('scouts').select('*')
    .eq('label_id', user.id).eq('artist_id', artist.id).maybeSingle(),
  supabase.from('artist_stats_daily').select('daily_streams_top10')
    .eq('artist_id', artist.id).order('date', { ascending: false }).limit(14),
  supabase.from('scouts').select('*', { count: 'exact', head: true })
    .eq('label_id', user.id).is('completed_at', null),
  // NEW:
  supabase.from('watchlists').select('id').eq('label_id', user.id).eq('artist_id', artist.id).maybeSingle(),
  supabase.from('watchlists').select('label_id, added_at, labels(label_name)')
    .eq('artist_id', artist.id).order('added_at', { ascending: true }).limit(6),
])
```

Then extract the new values and pass them to the client component. After the existing destructuring, add:

```typescript
const isWatching = !!watchingRes.data
const watchersRaw = (watchersRes.data ?? []) as {
  label_id: string
  labels: { label_name: string } | null
}[]
const watchers = watchersRaw.map(w => ({
  labelId: w.label_id,
  labelName: w.labels?.label_name ?? 'Unknown',
}))
// Total count for "+N more"
const { count: watcherCount } = await supabase
  .from('watchlists')
  .select('*', { count: 'exact', head: true })
  .eq('artist_id', artist.id)
```

Pass to the `<ArtistProfileClient>` component:

```tsx
return (
  <ArtistProfileClient
    artist={artist as Artist}
    stats={statsForClient}
    spark={sparkRes.data ?? []}
    signedByCount={countRes.count ?? 0}
    undergroundSignal={artist.tier === 'underground'}
    label={labelRes.data as Label}
    rosterCount={activeContractsRes.data?.length ?? 0}
    scout={scout}
    activeScoutCount={activeScoutCount}
    scoutReport={scoutReport}
    spotifyData={spotifyData as SpotifyEnrichment | null}
    isWatching={isWatching}
    watchers={watchers}
    watcherCount={watcherCount ?? 0}
  />
)
```

- [ ] **Step 2: Add props and watchlist UI to `client.tsx`**

In `client.tsx`, find the `ArtistProfileClientProps` interface (the type/interface that defines the component props — search for `artist: Artist` to find where props are declared) and add the three new props:

```typescript
  isWatching: boolean
  watchers: { labelId: string; labelName: string }[]
  watcherCount: number
```

The component already has `const router = useRouter()` — no new import needed.

Add watchlist state inside the component function, near the top with the other `useState` calls:

```typescript
const [watching, setWatching] = useState(isWatching)
const [watchLoading, setWatchLoading] = useState(false)
```

Add a toggle handler near the other handler functions:

```typescript
async function handleWatchToggle() {
  setWatchLoading(true)
  if (watching) {
    await fetch(`/api/watchlist/${artist.id}`, { method: 'DELETE' })
    setWatching(false)
  } else {
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_id: artist.id }),
    })
    setWatching(true)
  }
  setWatchLoading(false)
  router.refresh()  // re-fetches server component data so "Watched by" count updates
}
```

Find the area in the JSX where the Scout button and Sign button are rendered (search for `SCOUT` or `SIGN` button text). Add the Watchlist toggle button **alongside them** in the same action row:

```tsx
<button
  onClick={handleWatchToggle}
  disabled={watchLoading}
  style={{
    fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10,
    padding: '8px 14px', letterSpacing: 1, cursor: watchLoading ? 'not-allowed' : 'pointer',
    border: `1px solid ${watching ? 'var(--lime)' : 'var(--line)'}`,
    color: watching ? 'var(--lime)' : 'var(--ink-mid)',
    background: watching ? 'rgba(200,255,58,0.08)' : 'transparent',
    opacity: watchLoading ? 0.5 : 1,
  }}
>
  {watching ? '★ WATCHING' : '☆ WATCHLIST'}
</button>
```

Add the "Watched by" section in the JSX below the main artist data block and above the offer form. Place it near where `signedByCount` is displayed. Show it only when `watcherCount > 0`:

```tsx
{watcherCount > 0 && (
  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
    <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginBottom: 6 }}>WATCHED BY</div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {watchers.slice(0, 5).map(w => (
        <a
          key={w.labelId}
          href={`/labels/${w.labelId}`}
          style={{
            color: 'var(--cyan)', fontSize: 9, border: '1px solid rgba(62,224,255,0.25)',
            padding: '2px 7px', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 600,
          }}
        >
          {w.labelName}
        </a>
      ))}
      {watcherCount > 5 && (
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>
          +{watcherCount - 5} more
        </span>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 3: Type-check**

```bash
cd the-roster && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verify**

Start dev server and open any artist profile. Confirm:
- `☆ WATCHLIST` button appears
- Clicking it turns it `★ WATCHING` with lime border
- Clicking again reverts to `☆ WATCHLIST`
- Navigate to `/watchlist` — the added artist appears in the list

- [ ] **Step 5: Commit**

```bash
git add the-roster/src/app/\(game\)/artist/
git commit -m "feat: watchlist toggle and watched-by on artist profile"
```

---

### Task 8: Leaderboard — link label names to public page

**Files:**
- Modify: `the-roster/src/app/(game)/leaderboard/client.tsx`

- [ ] **Step 1: Import Link and wrap label names**

At the top of `leaderboard/client.tsx`, the `Link` import from `next/link` already exists. Find the label name div inside the row render (it contains `{row.label_name}` and the "YOU" badge). Wrap the label name text in a `<Link>`:

Replace:
```tsx
<div style={{ color: isMe ? 'var(--lime)' : 'var(--ink-hi)', fontSize: 13 }}>
  {row.label_name}
  {isMe && <span className="tag" style={{ color: 'var(--lime)', fontSize: 8, marginLeft: 8, border: '1px solid var(--lime)', padding: '1px 4px' }}>YOU</span>}
</div>
```

With:
```tsx
<div style={{ fontSize: 13 }}>
  <Link
    href={`/labels/${row.label_id}`}
    style={{ color: isMe ? 'var(--lime)' : 'var(--ink-hi)', textDecoration: 'none' }}
  >
    {row.label_name}
  </Link>
  {isMe && <span className="tag" style={{ color: 'var(--lime)', fontSize: 8, marginLeft: 8, border: '1px solid var(--lime)', padding: '1px 4px' }}>YOU</span>}
</div>
```

Apply the same change to the "Your position outside top 10" row (the second block that renders `myRow.label_name`).

- [ ] **Step 2: Type-check**

```bash
cd the-roster && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verify**

Navigate to `/leaderboard`. Click a label name — should navigate to `/labels/[id]` showing their watchlist. If the label has no watchlist entries, the empty state message shows.

- [ ] **Step 4: Commit**

```bash
git add the-roster/src/app/\(game\)/leaderboard/client.tsx
git commit -m "feat: link leaderboard label names to public watchlist page"
```

---

### Task 9: Final integration check

- [ ] **Step 1: Run full test suite**

```bash
cd the-roster && npx vitest run
```

Expected: all tests pass (including the new `utils.test.ts` tests).

- [ ] **Step 2: Full flow walkthrough**

With dev server running:

1. Navigate to any artist profile → `☆ WATCHLIST` button visible
2. Click it → `★ WATCHING`, lime border
3. Navigate to `/watchlist` → artist appears with sparkline + "today" timestamp
4. Navigate back to artist profile → still shows `★ WATCHING`
5. Open `/leaderboard` → label names are links
6. Click a label name → `/labels/[id]` page loads with their watchlist
7. On artist profile, "WATCHED BY" section appears once at least one label is watching
8. Click a label chip in "WATCHED BY" → navigates to their public watchlist page

- [ ] **Step 3: Commit if any lint/type fixes were needed**

```bash
cd the-roster && npx tsc --noEmit
git add -p && git commit -m "fix: watchlist integration cleanup"
```
