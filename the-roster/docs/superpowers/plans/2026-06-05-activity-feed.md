# Activity Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live event feed showing royalty payments, signings, contract endings, and tier-ups — surfaced as a dashboard right-column widget and a full timeline replacing the history page.

**Architecture:** New `label_events` table stores events written by three sources: the contract signing route, the contract drop route, and the weekly tick (which gains a Pass 3 for tier-up detection). Pure helper functions in `src/lib/activity-helpers.ts` handle formatting and week-grouping. Dashboard converts to a two-column layout; history page is replaced entirely.

**Tech Stack:** Next.js 16 Server Components, Supabase JS v2, Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migration_006_label_events.sql` | Create | label_events table + index + RLS |
| `src/lib/types.ts` | Modify | Add `LabelEvent`, `EventType` |
| `src/lib/activity-helpers.ts` | Create | Pure helpers: `describeEvent`, `relativeTime`, `getWeekLabel`, `groupByWeek` |
| `src/lib/activity-helpers.test.ts` | Create | Unit tests for all helpers |
| `src/app/api/contracts/route.ts` | Modify | Write `artist_signed` event after signing |
| `src/app/api/contracts/[id]/route.ts` | Modify | Write `contract_expired` event after drop |
| `src/app/api/royalties/weekly/route.ts` | Modify | Batch artist fetch; write `royalty_paid`, `contract_expired`, `tier_up` events |
| `src/app/(game)/dashboard/page.tsx` | Modify | Two-column layout + activity widget |
| `src/app/(game)/history/page.tsx` | Rewrite | Full activity timeline grouped by week |

---

## Task 1: Migration + TypeScript types

**Files:**
- Create: `supabase/migration_006_label_events.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create the migration file**

Create `supabase/migration_006_label_events.sql`:

```sql
-- Migration 006 — label_events: activity feed log
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

ALTER TABLE label_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_events: own label" ON label_events
  FOR ALL USING (auth.uid() = label_id) WITH CHECK (auth.uid() = label_id);
```

- [ ] **Step 2: Run the migration in Supabase**

Go to: Supabase dashboard → SQL Editor → paste the file contents → Run.

Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY` — no errors.

- [ ] **Step 3: Add types to src/lib/types.ts**

Append to the end of `src/lib/types.ts` (after the `LabelHistory` interface):

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

- [ ] **Step 4: Verify build**

```bash
cd /Users/paulbourdon/Roster/the-roster && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migration_006_label_events.sql src/lib/types.ts
git commit -m "feat: add label_events table and TypeScript types"
```

---

## Task 2: Activity helpers — pure functions + tests (TDD)

**Files:**
- Create: `src/lib/activity-helpers.ts`
- Create: `src/lib/activity-helpers.test.ts`

### Context

These pure functions are used by both the dashboard widget and the history page. All are side-effect-free and easily testable.

- `describeEvent(event)` → one-line string for the widget
- `relativeTime(dateStr)` → "Mon", "Fri", "5d ago"
- `getWeekLabel(dateStr)` → "Jun 2, 2026" (Monday of that ISO week)
- `groupByWeek(events)` → `Array<{ weekLabel: string; events: LabelEvent[] }>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/activity-helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { describeEvent, getWeekLabel, groupByWeek } from './activity-helpers'
import type { LabelEvent } from './types'

function makeEvent(overrides: Partial<LabelEvent> = {}): LabelEvent {
  return {
    id: '1', label_id: 'l1', event_type: 'royalty_paid',
    artist_name: 'Aya Nakamura',
    payload: { amount: 17.5, multiplier: 2.0, has_stream_data: true },
    created_at: '2026-06-05T08:00:00Z',
    ...overrides,
  }
}

describe('describeEvent', () => {
  it('formats royalty_paid', () => {
    expect(describeEvent(makeEvent())).toBe('Earned $17.50 from Aya Nakamura')
  })

  it('formats artist_signed', () => {
    const e = makeEvent({
      event_type: 'artist_signed',
      payload: { months: 6, split_pct: 40, signing_bonus: 1200 },
    })
    expect(describeEvent(e)).toBe('Signed Aya Nakamura · 6mo deal')
  })

  it('formats contract_expired with positive P&L', () => {
    const e = makeEvent({
      event_type: 'contract_expired',
      payload: { net_pnl: 340, total_royalties: 1540, signing_bonus: 1200, reason: 'natural' },
    })
    expect(describeEvent(e)).toBe('Contract ended — Aya Nakamura · +$340')
  })

  it('formats contract_expired with negative P&L', () => {
    const e = makeEvent({
      event_type: 'contract_expired',
      payload: { net_pnl: -860, total_royalties: 340, signing_bonus: 1200, reason: 'natural' },
    })
    expect(describeEvent(e)).toBe('Contract ended — Aya Nakamura · -$860')
  })

  it('formats tier_up', () => {
    const e = makeEvent({ event_type: 'tier_up', payload: { new_tier: 'rising' } })
    expect(describeEvent(e)).toBe('Aya Nakamura reached rising tier')
  })
})

describe('getWeekLabel', () => {
  it('returns the Monday of the week for a Friday', () => {
    // 2026-06-05 is a Friday; Monday of that week is Jun 2
    expect(getWeekLabel('2026-06-05T08:00:00Z')).toBe('Jun 2, 2026')
  })

  it('returns the same date for a Monday', () => {
    expect(getWeekLabel('2026-06-02T08:00:00Z')).toBe('Jun 2, 2026')
  })

  it('handles Sunday (maps to previous Monday)', () => {
    // 2026-06-07 is a Sunday; Monday of that week is Jun 2
    expect(getWeekLabel('2026-06-07T08:00:00Z')).toBe('Jun 2, 2026')
  })
})

describe('groupByWeek', () => {
  it('groups events from the same week together', () => {
    const events = [
      makeEvent({ id: '1', created_at: '2026-06-05T08:00:00Z' }),
      makeEvent({ id: '2', created_at: '2026-06-03T10:00:00Z' }),
    ]
    const groups = groupByWeek(events)
    expect(groups).toHaveLength(1)
    expect(groups[0].events).toHaveLength(2)
    expect(groups[0].weekLabel).toBe('Jun 2, 2026')
  })

  it('separates events from different weeks', () => {
    const events = [
      makeEvent({ id: '1', created_at: '2026-06-05T08:00:00Z' }),
      makeEvent({ id: '2', created_at: '2026-05-26T10:00:00Z' }),
    ]
    expect(groupByWeek(events)).toHaveLength(2)
  })

  it('preserves event order within a group', () => {
    const events = [
      makeEvent({ id: '1', created_at: '2026-06-05T08:00:00Z' }),
      makeEvent({ id: '2', created_at: '2026-06-03T10:00:00Z' }),
    ]
    const groups = groupByWeek(events)
    expect(groups[0].events[0].id).toBe('1')
    expect(groups[0].events[1].id).toBe('2')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: 11 failing tests with `Cannot find module './activity-helpers'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/activity-helpers.ts`:

```typescript
import type { LabelEvent } from './types'

export function describeEvent(e: LabelEvent): string {
  const p = e.payload
  switch (e.event_type) {
    case 'royalty_paid':
      return `Earned $${(p.amount as number).toFixed(2)} from ${e.artist_name}`
    case 'artist_signed':
      return `Signed ${e.artist_name} · ${p.months}mo deal`
    case 'contract_expired': {
      const pnl = p.net_pnl as number
      return `Contract ended — ${e.artist_name} · ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(0)}`
    }
    case 'tier_up':
      return `${e.artist_name} reached ${p.new_tier} tier`
    default:
      return e.artist_name
  }
}

export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400_000)
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  return `${diffDays}d ago`
}

export function getWeekLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getUTCDay() // 0=Sun, 1=Mon, …
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() + diff)
  return monday.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

export function groupByWeek(
  events: LabelEvent[],
): Array<{ weekLabel: string; events: LabelEvent[] }> {
  const groups = new Map<string, LabelEvent[]>()
  for (const e of events) {
    const label = getWeekLabel(e.created_at)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(e)
  }
  return Array.from(groups.entries()).map(([weekLabel, evts]) => ({ weekLabel, events: evts }))
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
npm test
```

Expected: 9 royalty tests + 11 activity helper tests = **20 passed**.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity-helpers.ts src/lib/activity-helpers.test.ts
git commit -m "feat: add activity helper functions with tests"
```

---

## Task 3: Write artist_signed event on contract creation

**Files:**
- Modify: `src/app/api/contracts/route.ts`

### Context

`src/app/api/contracts/route.ts` handles `POST /api/contracts`. The handler ends with:

```typescript
  if (treasuryErr) {
    await supabase.from('contracts').delete().eq('id', contract.id)
    return Response.json({ error: 'Treasury update failed - contract rolled back' }, { status: 500 })
  }

  return Response.json(contract, { status: 201 })
```

Insert the event write between the treasury error check and the final return. The session-based client (`supabase`) already satisfies RLS since `user.id === label_id`.

- [ ] **Step 1: Add the event write**

Read `src/app/api/contracts/route.ts`. After the treasury error check block and before `return Response.json(contract, { status: 201 })`, add:

```typescript
  await supabase.from('label_events').insert({
    label_id: user.id,
    event_type: 'artist_signed',
    artist_name: artist.name,
    payload: {
      months: term_months,
      split_pct: rev_split_label_pct,
      signing_bonus,
    },
  })

  return Response.json(contract, { status: 201 })
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Sign an artist via the UI or curl. Then verify in Supabase SQL Editor:

```sql
SELECT event_type, artist_name, payload, created_at
FROM label_events ORDER BY created_at DESC LIMIT 1;
```

Expected: `event_type = 'artist_signed'`, correct `artist_name`, `payload` has `months`, `split_pct`, `signing_bonus`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/contracts/route.ts
git commit -m "feat: write artist_signed event on contract creation"
```

---

## Task 4: Write contract_expired event on artist drop

**Files:**
- Modify: `src/app/api/contracts/[id]/route.ts`

### Context

`src/app/api/contracts/[id]/route.ts` handles `DELETE`. The handler ends with:

```typescript
  const { error: histErr } = await supabase.from('label_history').insert({ ... })
  if (histErr) return Response.json({ error: histErr.message }, { status: 500 })

  return Response.json({ ok: true, penalty })
```

`netPnl` is already computed at the top of the handler as `contract.royalties_earned - contract.signing_bonus - contract.dev_spend_total`.

- [ ] **Step 1: Add the event write**

Read `src/app/api/contracts/[id]/route.ts`. After the `if (histErr)` check and before `return Response.json({ ok: true, penalty })`, add:

```typescript
  await supabase.from('label_events').insert({
    label_id: user.id,
    event_type: 'contract_expired',
    artist_name: artist?.name ?? '',
    payload: {
      net_pnl: netPnl,
      total_royalties: contract.royalties_earned,
      signing_bonus: contract.signing_bonus,
      reason: 'dropped',
    },
  })

  return Response.json({ ok: true, penalty })
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/contracts/[id]/route.ts
git commit -m "feat: write contract_expired event when artist is dropped"
```

---

## Task 5: Write events in weekly tick (royalty_paid, contract_expired, tier_up)

**Files:**
- Modify: `src/app/api/royalties/weekly/route.ts`

### Context

Current file: `src/app/api/royalties/weekly/route.ts` (137 lines). Four changes:

1. Add `computeEngagementMultiplier` to the import
2. Batch-fetch all artist names/tiers after contracts load (one query, not N)
3. Pass 1: write `royalty_paid` event after `processed++`
4. Pass 2: write `contract_expired` event after `expired++`
5. Pass 3 (new): detect tier-ups and write `tier_up` events

### Steps

- [ ] **Step 1: Update imports**

Change line 2 from:
```typescript
import { computeWeeklyRoyalties } from '@/lib/royalty'
```
To:
```typescript
import { computeEngagementMultiplier, computeWeeklyRoyalties } from '@/lib/royalty'
```

- [ ] **Step 2: Add batch artist fetch after contracts load**

After the `if (!contracts?.length) return ...` line (~line 35), add:

```typescript
  // Batch-fetch artist names + tiers for event writing and tier-up detection
  const { data: artistRows } = await supabase
    .from('artists')
    .select('id, name, tier, tier_updated_at')
    .in('id', contracts.map(c => c.artist_id))
  const artistMap = new Map((artistRows ?? []).map(a => [a.id, a]))
```

- [ ] **Step 3: Write royalty_paid event in Pass 1**

After `processed++` in Pass 1 (currently the last line in the for-loop body before the closing `}`), add:

```typescript
    const multiplier = computeEngagementMultiplier(statsRow.monthly_listeners, actualWeeklyStreams)
    await supabase.from('label_events').insert({
      label_id: c.label_id,
      event_type: 'royalty_paid',
      artist_name: artistMap.get(c.artist_id)?.name ?? 'Unknown',
      payload: {
        amount: royalties,
        multiplier,
        has_stream_data: actualWeeklyStreams !== null,
      },
    })
```

- [ ] **Step 4: Write contract_expired event in Pass 2**

After `expired++` in Pass 2 (currently the last line in the for-loop body), add:

```typescript
    await supabase.from('label_events').insert({
      label_id: c.label_id,
      event_type: 'contract_expired',
      artist_name: artist?.name ?? 'Unknown',
      payload: {
        net_pnl: totalRoyalties - c.signing_bonus - c.dev_spend_total,
        total_royalties: totalRoyalties,
        signing_bonus: c.signing_bonus,
        reason: 'natural',
      },
    })
```

- [ ] **Step 5: Add Pass 3 — tier-up detection**

After the Pass 2 for-loop and before `return Response.json(...)`, add:

```typescript
  // ── Pass 3: detect tier-ups on still-active contracts ────────────────────────
  const expiredIds = new Set(toExpire.map(c => c.id))
  const remaining = contracts.filter(c => !expiredIds.has(c.id))

  for (const c of remaining) {
    const artist = artistMap.get(c.artist_id)
    if (!artist?.tier_updated_at) continue
    if (artist.tier_updated_at < statsWeekStart || artist.tier_updated_at > statsDate) continue
    await supabase.from('label_events').insert({
      label_id: c.label_id,
      event_type: 'tier_up',
      artist_name: artist.name,
      payload: { new_tier: artist.tier },
    })
  }
```

- [ ] **Step 6: Verify build + tests**

```bash
npm run build && npm test
```

Expected: build clean, 20 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/royalties/weekly/route.ts
git commit -m "feat: write royalty_paid, contract_expired, tier_up events in weekly tick"
```

---

## Task 6: Dashboard — two-column layout with activity widget

**Files:**
- Modify: `src/app/(game)/dashboard/page.tsx`

### Context

Current file: `src/app/(game)/dashboard/page.tsx`. Changes:
1. `getDashboardData` fetches last 8 `label_events` in parallel with existing queries
2. Add `EVENT_COLORS` map and `describeEvent`/`relativeTime` imports
3. Change outer `maxWidth` from 960 → 1200
4. Wrap the Active Roster panel + new Activity Widget in a two-column grid

### Steps

- [ ] **Step 1: Update imports**

Read `src/app/(game)/dashboard/page.tsx`. Change the type import line from:
```typescript
import type { Label, Contract } from '@/lib/types'
```
To:
```typescript
import type { Label, Contract, LabelEvent } from '@/lib/types'
import { describeEvent, relativeTime } from '@/lib/activity-helpers'
```

- [ ] **Step 2: Update getDashboardData**

Change the return type and parallel fetch. Replace:
```typescript
  const [labelRes, contractsRes] = await Promise.all([
    supabase.from('labels').select('*').eq('id', user.id).single(),
    supabase.from('contracts')
      .select('*, artists(name, tier, spotify_id)')
      .eq('label_id', user.id)
      .order('created_at', { ascending: false }),
  ])
  return { label: labelRes.data as Label, contracts: (contractsRes.data ?? []) as ContractRow[] }
```
With:
```typescript
  const [labelRes, contractsRes, eventsRes] = await Promise.all([
    supabase.from('labels').select('*').eq('id', user.id).single(),
    supabase.from('contracts')
      .select('*, artists(name, tier, spotify_id)')
      .eq('label_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('label_events')
      .select('*')
      .eq('label_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8),
  ])
  return {
    label: labelRes.data as Label,
    contracts: (contractsRes.data ?? []) as ContractRow[],
    events: (eventsRes.data ?? []) as LabelEvent[],
  }
```

- [ ] **Step 3: Add EVENT_COLORS + destructure events**

After `TIER_COLORS`, add:
```typescript
const EVENT_COLORS: Record<string, string> = {
  royalty_paid: 'var(--lime)',
  artist_signed: 'var(--cyan)',
  contract_expired: 'var(--rose)',
  tier_up: 'var(--amber)',
}
```

In `DashboardPage`, change:
```typescript
  const { label, contracts } = data
```
To:
```typescript
  const { label, contracts, events } = data
```

- [ ] **Step 4: Update outer div maxWidth and wrap roster in two-column grid**

Change `maxWidth: 960` to `maxWidth: 1200` on the outer div.

Replace the entire Active Roster `<div>` block (from `{/* Active roster */}` to its closing `</div>`) with the two-column grid below. The roster content inside is identical to the current roster — only the outer wrapper changes:

```tsx
      {/* Two-column: roster + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* Left: Active roster (unchanged content) */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          <div style={{ padding: '8px 16px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>ACTIVE ROSTER</span>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{active.length} ARTISTS</span>
          </div>
          {active.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--ink-mid)', fontSize: 13, marginBottom: 16 }}>Your roster is empty</div>
              <Link href="/search" style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px',
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
                      color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 9,
                      border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 5px',
                      background: `${TIER_COLORS[c.artists.tier] ?? 'transparent'}18`,
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
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '5px 10px',
                  border: '1px solid var(--line)', color: 'var(--ink-mid)', textDecoration: 'none',
                }}>MANAGE</Link>
              </div>
            )
          })}
        </div>

        {/* Right: Activity widget */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          <div style={{ padding: '8px 14px', borderBottom: '2px solid var(--line)' }}>
            <span className="tag" style={{ color: 'var(--lime)', fontSize: 10 }}>RECENT ACTIVITY</span>
          </div>
          {events.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--ink-mid)', fontSize: 12 }}>No activity yet</div>
          ) : events.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--line-soft)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: EVENT_COLORS[e.event_type], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {describeEvent(e)}
                </div>
              </div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, flexShrink: 0 }}>
                {relativeTime(e.created_at)}
              </div>
            </div>
          ))}
          <div style={{ padding: '8px 14px' }}>
            <Link href="/history" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--ink-low)', textDecoration: 'none', letterSpacing: 1 }}>
              VIEW ALL →
            </Link>
          </div>
        </div>

      </div>
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(game)/dashboard/page.tsx
git commit -m "feat: add two-column dashboard layout with activity widget"
```

---

## Task 7: History page rewrite — activity timeline

**Files:**
- Rewrite: `src/app/(game)/history/page.tsx`

### Context

Replace the entire file. The new page fetches `label_events` (not `label_history`), groups them by ISO week using `groupByWeek`, and renders each event type with its specific layout.

### Steps

- [ ] **Step 1: Replace history/page.tsx entirely**

```tsx
import { createClient } from '@/lib/supabase/server'
import type { LabelEvent } from '@/lib/types'
import { groupByWeek } from '@/lib/activity-helpers'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

const EVENT_ICONS: Record<string, string> = {
  royalty_paid: '$', artist_signed: '✍', contract_expired: '✗', tier_up: '↑',
}

const EVENT_COLORS: Record<string, string> = {
  royalty_paid: 'var(--lime)', artist_signed: 'var(--cyan)',
  contract_expired: 'var(--rose)', tier_up: 'var(--amber)',
}

function fmtUSD(n: number) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtTime(dateStr: string) {
  const date = new Date(dateStr)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${weekday} ${time}`
}

function EventRow({ event }: { event: LabelEvent }) {
  const p = event.payload
  const color = EVENT_COLORS[event.event_type] ?? 'var(--ink-mid)'
  const icon = EVENT_ICONS[event.event_type] ?? '·'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{
        width: 28, height: 28, border: `1.5px solid ${color}`, background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 11, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        {event.event_type === 'royalty_paid' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>Royalty payment — {event.artist_name}</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              Royalty · {p.has_stream_data ? `${(p.multiplier as number).toFixed(1)}× engagement` : 'no stream data'}
            </div>
            <div className="tag" style={{ color: 'var(--lime)', fontSize: 11, marginTop: 4 }}>+{fmtUSD(p.amount as number)}</div>
          </>
        )}
        {event.event_type === 'artist_signed' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>Signed {event.artist_name}</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              {p.months as number}-month contract · {p.split_pct as number}% split
            </div>
            <div className="tag" style={{ color: 'var(--amber)', fontSize: 11, marginTop: 4 }}>{fmtUSD(p.signing_bonus as number)} signing bonus</div>
          </>
        )}
        {event.event_type === 'contract_expired' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>Contract ended — {event.artist_name}</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              {p.reason === 'dropped' ? 'Dropped' : 'Natural expiry'}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 5 }}>
              <div>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>Royalties </span>
                <span className="tag" style={{ color: 'var(--lime)', fontSize: 9 }}>{fmtUSD(p.total_royalties as number)}</span>
              </div>
              <div>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>Cost </span>
                <span className="tag" style={{ color: 'var(--amber)', fontSize: 9 }}>{fmtUSD(p.signing_bonus as number)}</span>
              </div>
              <div>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>Net P&L </span>
                <span className="tag" style={{ color: (p.net_pnl as number) >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 9 }}>
                  {fmtUSD(p.net_pnl as number)}
                </span>
              </div>
            </div>
          </>
        )}
        {event.event_type === 'tier_up' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>{event.artist_name} reached {p.new_tier as string} tier</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>Tier change · on your roster</div>
            <span className="tag" style={{
              display: 'inline-block', marginTop: 5,
              color: TIER_COLORS[p.new_tier as string] ?? 'var(--ink-mid)',
              border: `1px solid ${TIER_COLORS[p.new_tier as string] ?? 'var(--line)'}`,
              padding: '2px 6px', fontSize: 9,
            }}>{(p.new_tier as string).toUpperCase()}</span>
          </>
        )}
      </div>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, flexShrink: 0, paddingTop: 2 }}>
        {fmtTime(event.created_at)}
      </div>
    </div>
  )
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('label_events')
    .select('*')
    .eq('label_id', user.id)
    .order('created_at', { ascending: false })

  const events = (data ?? []) as LabelEvent[]
  const weeks = groupByWeek(events)

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 760 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>ACTIVITY</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 24 }}>FEED</div>

      {weeks.length === 0 ? (
        <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>No activity yet — sign your first artist to get started.</div>
      ) : weeks.map(({ weekLabel, events: weekEvents }) => (
        <div key={weekLabel} style={{ marginBottom: 24 }}>
          <div className="tag" style={{
            color: 'var(--ink-low)', fontSize: 9, padding: '6px 0 8px',
            borderBottom: '1px solid var(--line-soft)', marginBottom: 2,
          }}>
            WEEK OF {weekLabel.toUpperCase()}
          </div>
          <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
            {weekEvents.map(e => <EventRow key={e.id} event={e} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: 20 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/(game)/history/page.tsx
git commit -m "feat: replace history page with activity timeline"
```
