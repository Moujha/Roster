# Reputation Consequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the label reputation score (0–1000) actually affect gameplay: easier negotiations for high-rep labels, a +10 bonus for re-signing artists, and gated data visibility on artist profiles.

**Architecture:** Three independent changes. (1) A pure utility `repNegParams` is extracted from the offer route's inline constants and made reputation-aware. (2) The offer route's `createContract` function checks for a prior contract with the same artist to fire the re-sign +10 event. (3) The artist profile server page nulls out Established-gated fields before passing stats to the client, and queries competitor scout counts only for Veteran labels.

**Tech Stack:** Next.js 15 App Router (server components + route handlers), Supabase (authenticated + service role clients), Vitest, TypeScript

---

## GDD References

- §6.2.1 — Reputation tiers and signing modifier: New (+0, window 15), Established (−5, window 20), Veteran (−10, window 25)
- §6.2.2 — Re-sign +10 reputation event
- §9.5 — Data visibility table: velocity (7d) and catalog depth are Established+ only
- §9.6 — Veteran unlock: competitor scout counts on artist profiles

---

## File Map

| File | Change |
|------|--------|
| `the-roster/src/lib/negotiation.ts` | Add `repNegParams(reputation)` export |
| `the-roster/src/lib/negotiation.test.ts` | Create — tests for `repNegParams` |
| `the-roster/src/app/api/contracts/offer/route.ts` | Use `repNegParams`, add re-sign check + bonus |
| `the-roster/src/app/(game)/artist/[spotifyId]/page.tsx` | Fetch reputation, gate stats, add competitor scout count |
| `the-roster/src/app/(game)/artist/[spotifyId]/client.tsx` | Accept new props, display competitor scouts for Veterans |

---

## Task 1: repNegParams utility (TDD)

**Files:**
- Modify: `the-roster/src/lib/negotiation.ts`
- Create: `the-roster/src/lib/negotiation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `the-roster/src/lib/negotiation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { repNegParams } from './negotiation'

describe('repNegParams', () => {
  it('New label (0 rep): no modifier, window 15', () => {
    expect(repNegParams(0)).toEqual({ targetModifier: 0, counterWindow: 15 })
  })

  it('New label (249 rep): still New tier', () => {
    expect(repNegParams(249)).toEqual({ targetModifier: 0, counterWindow: 15 })
  })

  it('Established label (250 rep): -5 modifier, window 20', () => {
    expect(repNegParams(250)).toEqual({ targetModifier: -5, counterWindow: 20 })
  })

  it('Established label (599 rep): still Established', () => {
    expect(repNegParams(599)).toEqual({ targetModifier: -5, counterWindow: 20 })
  })

  it('Veteran label (600 rep): -10 modifier, window 25', () => {
    expect(repNegParams(600)).toEqual({ targetModifier: -10, counterWindow: 25 })
  })

  it('Veteran label (1000 rep): still Veteran', () => {
    expect(repNegParams(1000)).toEqual({ targetModifier: -10, counterWindow: 25 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd the-roster && npx vitest run src/lib/negotiation.test.ts
```

Expected: FAIL — `repNegParams is not a function` (or similar import error)

- [ ] **Step 3: Add repNegParams to negotiation.ts**

In `the-roster/src/lib/negotiation.ts`, add this function after `generateTargetScore`:

```typescript
// §6.2.1 — Reputation tier modifies signing target score and counter window
export function repNegParams(reputation: number): { targetModifier: number; counterWindow: number } {
  if (reputation >= 600) return { targetModifier: -10, counterWindow: 25 }
  if (reputation >= 250) return { targetModifier: -5, counterWindow: 20 }
  return { targetModifier: 0, counterWindow: 15 }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd the-roster && npx vitest run src/lib/negotiation.test.ts
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd the-roster && git add src/lib/negotiation.ts src/lib/negotiation.test.ts
git commit -m "feat: repNegParams utility for reputation-gated negotiation"
```

---

## Task 2: Wire reputation into offer route + re-sign bonus

**Files:**
- Modify: `the-roster/src/app/api/contracts/offer/route.ts`

Current state (lines 51–54, 97–108):
```typescript
const { data: label } = await supabase
  .from('labels').select('treasury').eq('id', user.id).single()
if (!label || label.treasury < bonus)
  return Response.json({ error: 'Insufficient treasury' }, { status: 402 })
// ...
const target = artist.negotiation_target ?? 65
// Reputation modifier (reputation system not yet built — defaults to New)
const targetModifier = 0
const counterWindow = 15
const effectiveTarget = target + targetModifier
```

And `createContract` signature (line 160):
```typescript
async function createContract(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  labelId: string,
  currentTreasury: number,
  artist: { id: string; tier: string; name: string },
  offer: ContractOffer,
)
```

- [ ] **Step 1: Update the POST handler**

Make these changes to the `POST` function in `the-roster/src/app/api/contracts/offer/route.ts`:

**1a. Add `repNegParams` to the import at the top:**

```typescript
import { computeOfferScore, generateCounter, repNegParams } from '@/lib/negotiation'
```

**1b. Change the label select to include `reputation` (line ~51):**

```typescript
const { data: label } = await supabase
  .from('labels').select('treasury, reputation').eq('id', user.id).single()
if (!label || label.treasury < bonus)
  return Response.json({ error: 'Insufficient treasury' }, { status: 402 })
```

**1c. After the cooling-off check and before the round check (~line 86), add the re-sign check:**

```typescript
// Check for prior completed contract with this artist (re-sign detection)
const { count: priorCount } = await supabase
  .from('contracts')
  .select('*', { count: 'exact', head: true })
  .eq('label_id', user.id)
  .eq('artist_id', artist_id)
  .in('status', ['expired', 'dropped'])
const isResign = (priorCount ?? 0) > 0
```

**1d. Replace the inline reputation stub (lines ~103–108) with the real computation:**

```typescript
const { targetModifier, counterWindow } = repNegParams(label.reputation ?? 0)
const effectiveTarget = target + targetModifier
```

**1e. Pass `isResign` and `label.reputation` to `createContract` (line ~117):**

```typescript
const contract = await createContract(supabase, user.id, label.treasury, label.reputation ?? 0, artist, offer, isResign)
```

- [ ] **Step 2: Update createContract signature and body**

Replace the `createContract` function entirely with this version:

```typescript
async function createContract(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  labelId: string,
  currentTreasury: number,
  currentReputation: number,
  artist: { id: string; tier: string; name: string },
  offer: ContractOffer,
  isResign: boolean,
) {
  const today = new Date().toISOString().slice(0, 10)
  const endDate = new Date(Date.now() + offer.term_months * 30 * 86400_000).toISOString().slice(0, 10)

  const { data: latestStats } = await supabase
    .from('artist_stats_daily').select('monthly_listeners, listener_growth_28d')
    .eq('artist_id', artist.id).order('date', { ascending: false }).limit(1).maybeSingle()

  const { data: contract, error } = await supabase.from('contracts').insert({
    label_id: labelId,
    artist_id: artist.id,
    signing_bonus: offer.bonus,
    rev_split_label_pct: offer.rev_split_label_pct,
    term_months: offer.term_months,
    start_date: today,
    end_date: endDate,
    baseline_listeners: latestStats?.monthly_listeners ?? null,
    baseline_growth_pct: latestStats?.listener_growth_28d ?? null,
  }).select().single()

  if (error || !contract) return null

  await Promise.all([
    supabase.from('labels').update({ treasury: currentTreasury - offer.bonus }).eq('id', labelId),
    supabase.from('label_events').insert({
      label_id: labelId,
      event_type: 'artist_signed',
      artist_name: artist.name,
      payload: { months: offer.term_months, split_pct: offer.rev_split_label_pct, signing_bonus: offer.bonus },
    }),
  ])

  if (isResign) {
    await supabase.from('labels')
      .update({ reputation: Math.min(1000, currentReputation + 10) })
      .eq('id', labelId)
  }

  return contract
}
```

- [ ] **Step 3: Type-check**

```bash
cd the-roster && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run full test suite**

```bash
cd the-roster && npx vitest run
```

Expected: all tests pass (including the new negotiation.test.ts)

- [ ] **Step 5: Commit**

```bash
cd the-roster && git add src/app/api/contracts/offer/route.ts
git commit -m "feat: reputation-gated negotiation and re-sign bonus"
```

---

## Task 3: Artist profile data visibility gating

**Files:**
- Modify: `the-roster/src/app/(game)/artist/[spotifyId]/page.tsx`
- Modify: `the-roster/src/app/(game)/artist/[spotifyId]/client.tsx`

### GDD data visibility rules (§9.5):

| Field | Threshold |
|-------|-----------|
| `stream_velocity_7d` | Established (250+) |
| `catalog_depth_score` | Established (250+) |
| Competitor scout count | Veteran (600+) |

### Changes to page.tsx

Current label select (line 32):
```typescript
supabase.from('labels').select('treasury, id').eq('id', user.id).single(),
```

- [ ] **Step 1: Update page.tsx**

**1a. Change label select to include `reputation`:**

```typescript
supabase.from('labels').select('treasury, id, reputation').eq('id', user.id).single(),
```

**1b. After the Promise.all results are destructured (after line 43), add reputation booleans and the gated stats computation. Replace the existing `statsForClient` assignment:**

Current (around line 59–62):
```typescript
const stats = statsRes.data as ArtistStats | null
const statsForClient = stats && artist.tier === 'underground'
  ? { ...stats, momentum_score: null }
  : stats
```

Replace with:
```typescript
const label = labelRes.data
const labelReputation = label?.reputation ?? 0
const isEstablished = labelReputation >= 250
const isVeteran = labelReputation >= 600

const stats = statsRes.data as ArtistStats | null
const statsForClient = (() => {
  if (!stats) return null
  const withUnderground = artist.tier === 'underground' ? { ...stats, momentum_score: null } : stats
  if (!isEstablished) return { ...withUnderground, stream_velocity_7d: null, catalog_depth_score: null }
  return withUnderground
})()
```

**1c. Add competitor scout count query. Place this AFTER the code block from Step 1b (which defines `isVeteran`), and before the existing `const scout = scoutRes.data` line:**

```typescript
let competitorScoutCount = 0
if (isVeteran) {
  const { count } = await createServiceClient()
    .from('scouts')
    .select('*', { count: 'exact', head: true })
    .eq('artist_id', artist.id)
    .neq('label_id', user.id)
    .is('completed_at', null)
  competitorScoutCount = count ?? 0
}
```

**1d. Pass the new props to `ArtistProfileClient`. The existing render call passes `label={labelRes.data as Label}`. Change it to:**

```typescript
label={label as Label}
```

And add two new props:
```typescript
labelReputation={labelReputation}
competitorScoutCount={competitorScoutCount}
```

The full updated `return` call:
```typescript
return (
  <ArtistProfileClient
    artist={artist as Artist}
    stats={statsForClient}
    spark={sparkRes.data ?? []}
    signedByCount={countRes.count ?? 0}
    undergroundSignal={artist.tier === 'underground'}
    label={label as Label}
    rosterCount={activeContractsRes.data?.length ?? 0}
    scout={scout}
    activeScoutCount={activeScoutCount}
    scoutReport={scoutReport}
    spotifyData={spotifyData as SpotifyEnrichment | null}
    isWatching={isWatching}
    watchers={watchers}
    watcherCount={watcherCount}
    labelReputation={labelReputation}
    competitorScoutCount={competitorScoutCount}
  />
)
```

### Changes to client.tsx

- [ ] **Step 2: Update client.tsx props and SIGNED BY display**

**2a. Add `labelReputation` and `competitorScoutCount` to the props destructuring and type. The current props type (around line 270):**

```typescript
export default function ArtistProfileClient({
  artist, stats, spark, signedByCount, undergroundSignal, label, rosterCount,
  scout, activeScoutCount, scoutReport, spotifyData, isWatching, watchers, watcherCount,
}: {
  artist: Artist
  // ...existing props...
  watcherCount: number
})
```

Change to:

```typescript
export default function ArtistProfileClient({
  artist, stats, spark, signedByCount, undergroundSignal, label, rosterCount,
  scout, activeScoutCount, scoutReport, spotifyData, isWatching, watchers, watcherCount,
  labelReputation, competitorScoutCount,
}: {
  artist: Artist
  stats: ArtistStats | null
  spark: { date: string; daily_streams_top10: number | null }[]
  signedByCount: number
  undergroundSignal: boolean
  label: Label
  rosterCount: number
  scout: Scout | null
  activeScoutCount: number
  scoutReport: ScoutReport
  spotifyData: SpotifyEnrichment | null
  isWatching: boolean
  watchers: { labelId: string; labelName: string }[]
  watcherCount: number
  labelReputation: number
  competitorScoutCount: number
})
```

**2b. Update the "SIGNED BY" stat box (~line 582–588) to show competitor scouts for Veterans:**

Current:
```tsx
<div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNED BY</div>
  <div className="display" style={{ fontSize: 28, color: 'var(--ink-hi)', lineHeight: 1, marginTop: 4 }}>
    {signedByCount} LABEL{signedByCount !== 1 ? 'S' : ''}
  </div>
</div>
```

Replace with:
```tsx
<div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNED BY</div>
  <div className="display" style={{ fontSize: 28, color: 'var(--ink-hi)', lineHeight: 1, marginTop: 4 }}>
    {signedByCount} LABEL{signedByCount !== 1 ? 'S' : ''}
  </div>
  {labelReputation >= 600 && competitorScoutCount > 0 && (
    <div className="tag" style={{ color: 'var(--amber)', fontSize: 9, marginTop: 4 }}>
      {competitorScoutCount} COMPETITOR{competitorScoutCount !== 1 ? 'S' : ''} SCOUTING
    </div>
  )}
</div>
```

- [ ] **Step 3: Type-check**

```bash
cd the-roster && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run full test suite**

```bash
cd the-roster && npx vitest run
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
cd the-roster && git add "src/app/(game)/artist/[spotifyId]/page.tsx" "src/app/(game)/artist/[spotifyId]/client.tsx"
git commit -m "feat: reputation-gated data visibility on artist profiles"
```
