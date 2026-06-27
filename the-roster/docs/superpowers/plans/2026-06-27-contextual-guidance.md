# Contextual Guidance System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add always-visible context banners and `ⓘ` hover tooltips across Dashboard, Artist Profile, Contracts, and Search to help players understand what to do and what the metrics mean.

**Architecture:** A tiny `InfoTip` component wraps every opaque metric label. Context banners are inline JSX following the existing `rgba` border + background pattern. No new state, no localStorage, no dismiss buttons.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase, TypeScript, inline styles (existing pattern).

---

## File Map

| File | Change |
|---|---|
| `src/components/info-tip.tsx` | **Create** — shared `<InfoTip text="...">` component |
| `src/app/(game)/dashboard/page.tsx` | Modify — 5 additions (InfoTips, rep progress, Monday chip, breaking alert, empty roster banner) |
| `src/app/(game)/artist/[spotifyId]/page.tsx` | Modify — add `isContracted` prop lookup |
| `src/app/(game)/artist/[spotifyId]/client.tsx` | Modify — Momentum InfoTip, metric InfoTips, remove signal tags, scout nudge banner |
| `src/app/(game)/contracts/dev-alloc.tsx` | Modify — Monday nudge, 3 InfoTips |
| `src/app/(game)/search/page.tsx` | Modify — active contract count query + empty roster banner |

---

## Task 1: Create `src/components/info-tip.tsx`

**Files:**
- Create: `src/components/info-tip.tsx`

- [ ] **Step 1: Check the components directory exists**

```bash
ls src/components/
```

Expected: directory exists with existing component files.

- [ ] **Step 2: Create the component**

```tsx
export function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        color: 'var(--cyan)',
        fontSize: 9,
        cursor: 'help',
        display: 'inline-flex',
        alignItems: 'center',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      ⓘ
    </span>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/info-tip.tsx
git commit -m "feat: add InfoTip component for metric hover tooltips"
```

---

## Task 2: Dashboard — all five additions

**Files:**
- Modify: `src/app/(game)/dashboard/page.tsx`

### What to change

1. **Import `InfoTip`** at top of file.
2. **Compute `hasUnallocatedBudget`** in the render — no new DB query needed.
3. **Add breaking alert lookup** after existing events are fetched in `getData()`.
4. **Return `latestBreakingAlert` and `breakingAlertSpotifyId`** from `getData()`.
5. **Render InfoTips** on TREASURY, WEEKLY INCOME, REPUTATION labels.
6. **Add reputation progress sub-label** below the rep number.
7. **Upgrade Monday chip** to include "ALLOCATE NOW →" link when budget is unallocated.
8. **Add breaking alert banner** above the roster section.
9. **Upgrade empty roster state** from bare text to a lime-bordered banner.

- [ ] **Step 1: Add InfoTip import and breaking alert logic to `getData()`**

In `getData()`, after `const events = ...` is assigned (around line 87), add the breaking alert derivation. Find the block that starts at the end of Pass 2 data assignments (around line 168 where `discoveryRows` is assigned). Add AFTER all Pass 2 data is resolved but BEFORE the `return` statement:

```typescript
  // Breaking alert: check recent events first, fall back to targeted lookup
  const cutoff48h = new Date(Date.now() - 48 * 3600_000)
  const latestBreakingAlert = events.find(
    e => e.event_type === 'breaking_alert' && new Date(e.created_at) > cutoff48h,
  ) ?? null

  let breakingAlertSpotifyId: string | null = null
  if (latestBreakingAlert) {
    const payload = latestBreakingAlert.payload as { artist_id?: string } | null
    const alertArtistId = payload?.artist_id ?? null
    if (alertArtistId) {
      const fromContract = active.find(c => c.artist_id === alertArtistId)
      if (fromContract) {
        breakingAlertSpotifyId = fromContract.artists.spotify_id
      } else {
        const fromDiscovery = discoveryRows.find(r => r.artist_id === alertArtistId)
        if (fromDiscovery?.artists?.spotify_id) {
          breakingAlertSpotifyId = fromDiscovery.artists.spotify_id
        } else {
          const { data: alertArtist } = await supabase.from('artists').select('spotify_id').eq('id', alertArtistId).maybeSingle()
          breakingAlertSpotifyId = alertArtist?.spotify_id ?? null
        }
      }
    }
  }
```

- [ ] **Step 2: Update the `return` statement of `getData()` to include the new fields**

Find the `return {` block (currently ends around line 218) and add:

```typescript
    latestBreakingAlert, breakingAlertSpotifyId,
```

- [ ] **Step 3: Update destructuring in `DashboardPage` to include the new fields**

Find the destructuring at the top of `DashboardPage` (around line 261):
```typescript
  const {
    label, active, expired, events,
    ...
  } = data
```

Add `latestBreakingAlert, breakingAlertSpotifyId,` to the destructure list.

- [ ] **Step 4: Add `InfoTip` import at the top of the file**

After the existing imports, add:
```typescript
import { InfoTip } from '@/components/info-tip'
```

- [ ] **Step 5: Compute `hasUnallocatedBudget` in the render**

After the `const rep = repTier(...)` and `const repBarPct = ...` lines (around line 271), add:
```typescript
  const hasUnallocatedBudget = active.length > 0 && active.some(c => {
    const a = allocMap.get(c.id)
    return !a || (a.playlist_tier === 'none' && a.social_push_tier === 'none')
  })
```

- [ ] **Step 6: Add InfoTips to TREASURY, WEEKLY INCOME, and REPUTATION labels**

Find the TREASURY stat cell (around line 352). Change the label from:
```tsx
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>TREASURY</div>
```
to:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>TREASURY</span>
            <InfoTip text="Your starting capital. Grows with royalties, shrinks with signing bonuses and dev spend." />
          </div>
```

Find the WEEKLY INCOME label (around line 359). Change:
```tsx
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>WEEKLY INCOME</div>
```
to:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>WEEKLY INCOME</span>
            <InfoTip text="Estimated weekly royalties from active contracts, before development spend." />
          </div>
```

Find the REPUTATION label (around line 368). Change:
```tsx
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>REPUTATION</div>
```
to:
```tsx
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>REPUTATION</span>
            <InfoTip text="Unlocks better data at 250 pts (Established) and deeper insights at 600 pts (Veteran). Grows when contracts complete naturally." />
          </div>
```

- [ ] **Step 7: Add reputation progress sub-label**

Find the reputation bar `<div>` (the flex container with `alignItems: 'center', gap: 6, marginTop: 4` around line 370). After that entire closing `</div>`, add:
```tsx
          {label.reputation < 600 && (
            <div className="tag" style={{ color: 'var(--cyan)', fontSize: 8, marginTop: 3 }}>
              {rep.next - label.reputation} PTS TO {label.reputation < 250 ? 'ESTABLISHED' : 'VETERAN'}
            </div>
          )}
```

- [ ] **Step 8: Upgrade the Monday chip**

Find the `{isMonday && (` block (around line 323). Replace:
```tsx
            {isMonday && (
              <span className="tag" style={{ color: 'var(--lime)', fontSize: 9, border: '1px solid rgba(200,255,58,0.4)', padding: '2px 8px', background: 'rgba(200,255,58,0.08)' }}>
                BUDGET UNLOCKED
              </span>
            )}
```
with:
```tsx
            {isMonday && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--lime)', fontSize: 9, border: '1px solid rgba(200,255,58,0.4)', padding: '2px 8px', background: 'rgba(200,255,58,0.08)' }}>
                <span className="tag">BUDGET UNLOCKED</span>
                {hasUnallocatedBudget && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <Link href="/contracts" style={{ color: 'var(--lime)', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: 1 }}>
                      ALLOCATE NOW →
                    </Link>
                  </>
                )}
              </div>
            )}
```

- [ ] **Step 9: Add breaking alert banner**

Find the expired contracts banner block (the `{expired.length > 0 && (...)}` block around line 390). Add the breaking alert banner BEFORE it:
```tsx
      {latestBreakingAlert && breakingAlertSpotifyId && (
        <div style={{ background: 'rgba(200,255,58,0.06)', border: '1px solid rgba(200,255,58,0.35)', padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="tag" style={{ color: 'var(--lime)', fontSize: 9, letterSpacing: 1 }}>BREAKING ALERT</div>
            <div style={{ color: 'var(--ink-hi)', fontSize: 11, marginTop: 2 }}>
              {latestBreakingAlert.artist_name} is surging this week.
            </div>
          </div>
          <Link
            href={`/artist/${breakingAlertSpotifyId}`}
            style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--lime)', border: '1px solid rgba(200,255,58,0.4)', padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 12 }}
          >
            VIEW →
          </Link>
        </div>
      )}
```

- [ ] **Step 10: Upgrade the empty roster banner**

Find the empty roster state (around line 424):
```tsx
          {active.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--ink-mid)', fontSize: 13, marginBottom: 16 }}>Your roster is empty</div>
              <Link href="/search" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px', border: '2px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none' }}>SIGN YOUR FIRST ARTIST</Link>
            </div>
```
Replace with:
```tsx
          {active.length === 0 ? (
            <div style={{ padding: '14px 16px', background: 'rgba(200,255,58,0.04)', border: '2px solid rgba(200,255,58,0.35)', margin: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="tag" style={{ color: 'var(--lime)', fontSize: 9, letterSpacing: 1 }}>SIGN YOUR FIRST ARTIST</div>
                <div style={{ color: 'var(--ink-mid)', fontSize: 11, marginTop: 3 }}>Find one on Search to start earning royalties.</div>
              </div>
              <Link href="/search" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--lime)', border: '1px solid rgba(200,255,58,0.4)', padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 12 }}>
                SEARCH →
              </Link>
            </div>
```

- [ ] **Step 11: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 12: Commit**

```bash
git add src/app/(game)/dashboard/page.tsx
git commit -m "feat: add contextual guidance to dashboard — InfoTips, rep progress, Monday chip link, breaking alert banner, empty roster banner"
```

---

## Task 3: Artist profile — momentum InfoTip, metric InfoTips, remove signal tags, scout nudge banner

**Files:**
- Modify: `src/app/(game)/artist/[spotifyId]/page.tsx`
- Modify: `src/app/(game)/artist/[spotifyId]/client.tsx`

### Sub-task 3a: Add `isContracted` prop from the server page

The client component needs to know if the player already has an active contract with this specific artist. The server page must query for it and pass it as a prop.

- [ ] **Step 1: Read the server page to find where scout is queried**

Read `src/app/(game)/artist/[spotifyId]/page.tsx` and locate the scout query (look for `scouts` table query). Note line numbers for where to add the `isContracted` query and where to pass it as a prop.

- [ ] **Step 2: Add `isContracted` query in the server page**

In the server page's data-fetching block (parallel with the scout query), add:
```typescript
const { data: activeContractRow } = await supabase
  .from('contracts')
  .select('id')
  .eq('label_id', user.id)
  .eq('artist_id', artist.id)
  .eq('status', 'active')
  .maybeSingle()
const isContracted = !!activeContractRow
```

Then pass `isContracted={isContracted}` where `ArtistProfileClient` is rendered.

### Sub-task 3b: Update the client component

- [ ] **Step 3: Add `InfoTip` import and `isContracted` prop to `client.tsx`**

Add at top of file (after existing imports):
```typescript
import { InfoTip } from '@/components/info-tip'
```

Add `isContracted: boolean` to the `ArtistProfileClient` props interface (the destructured params at line 272 and the type annotation below it).

- [ ] **Step 4: Remove `showMomentumTooltip` state and its `useEffect`**

Remove line 323: `const [showMomentumTooltip, setShowMomentumTooltip] = useState(false)`

Remove the `useEffect` block (lines 326–330):
```typescript
  useEffect(() => {
    if (!undergroundSignal && !localStorage.getItem('roster_momentum_tooltip_seen')) {
      setShowMomentumTooltip(true)
    }
  }, [undergroundSignal])
```

- [ ] **Step 5: Add persistent InfoTip to MOMENTUM label**

Find the MOMENTUM label in the render (around line 581):
```tsx
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>MOMENTUM</div>
```
Replace with:
```tsx
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>MOMENTUM</span>
                  <InfoTip text="Combines streaming growth, listener momentum, and catalog depth. Higher = more heat right now." />
                </div>
```

- [ ] **Step 6: Remove the `showMomentumTooltip` popover from the modal**

Inside the modal's `negPhase === 'reading'` block (around lines 919–945), find and remove the `{showMomentumTooltip && (...)}` block — the absolute-positioned tooltip with "GOT IT" button. The surrounding `<div style={{ position: 'relative' }}>` wrapper around the MOMENTUM stat should have its `position: 'relative'` style removed (change back to a plain `<div>`).

- [ ] **Step 7: Add InfoTips to 7D VELOCITY, CATALOG DEPTH, STREAMS/LISTENER labels**

Find the `7D VELOCITY` label (around line 586):
```tsx
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>7D VELOCITY</div>
```
Replace with:
```tsx
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>7D VELOCITY</span>
                    <InfoTip text="% change in top-10 daily streams vs. 7 days ago. Primary momentum signal." />
                  </div>
```

Find the `CATALOG DEPTH` label (around line 594):
```tsx
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>CATALOG DEPTH</div>
```
Replace with:
```tsx
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>CATALOG DEPTH</span>
                    <InfoTip text="How evenly streams spread across top 10 tracks. Higher = more durable audience, less reliance on one hit." />
                  </div>
```

Find the `STREAMS/LISTENER` label (around line 602):
```tsx
                    <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>STREAMS/LISTENER</div>
```
Replace with:
```tsx
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>STREAMS/LISTENER</span>
                      <InfoTip text="Daily streams ÷ monthly listeners. Above 0.15 signals a highly engaged fanbase." />
                    </div>
```

Note: these three labels are inside the `{labelReputation >= 250 && ...}` conditional blocks — the InfoTip only renders when the metric is visible, so no extra condition needed.

- [ ] **Step 8: Remove signal tags from the signing modal**

Inside the modal's `negPhase === 'reading'` block (around line 883), find and remove:
1. The line: `const tags = buildSignalTags(artist, stats, scoutReport, signedByCount, labelReputation)`
2. The entire `{tags.length > 0 && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>...</div>)}` block (around lines 949–960)

The `buildSignalTags` function definition can remain in the file (it's referenced only here; leaving it is harmless and avoids over-deletion risk). If TypeScript emits an "unused variable" error, remove the function definition too.

- [ ] **Step 9: Add scout nudge banner**

Find the action buttons block (the `{/* Action buttons */}` comment around line 691). Add the scout nudge banner BEFORE the action buttons div:

```tsx
      {/* Scout nudge — shown when no scout and not contracted */}
      {!scout && !isContracted && (
        <div style={{
          background: 'rgba(62,224,255,0.05)', border: '1px solid rgba(62,224,255,0.25)',
          padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div className="tag" style={{ color: 'var(--cyan)', fontSize: 9, letterSpacing: 1 }}>SCOUT FOR DETAILED INTEL</div>
            <div style={{ color: 'var(--ink-mid)', fontSize: 10, marginTop: 3 }}>
              A scout report reveals negotiation priorities and a precise bonus estimate — before you make an offer.
            </div>
          </div>
          <button
            onClick={handleScout}
            disabled={scouting || activeScoutCount >= 8}
            style={{
              fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9,
              color: 'var(--cyan)', border: '1px solid rgba(62,224,255,0.4)',
              padding: '4px 10px', background: 'transparent',
              cursor: scouting || activeScoutCount >= 8 ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', marginLeft: 12,
              opacity: activeScoutCount >= 8 ? 0.4 : 1,
            }}
          >
            {scouting ? '...' : 'DEPLOY →'}
          </button>
        </div>
      )}
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 11: Commit**

```bash
git add src/app/(game)/artist/[spotifyId]/page.tsx src/app/(game)/artist/[spotifyId]/client.tsx
git commit -m "feat: artist profile guidance — persistent Momentum InfoTip, metric InfoTips, scout nudge banner, remove signal tags"
```

---

## Task 4: Contracts dev-alloc — Monday nudge + three InfoTips

**Files:**
- Modify: `src/app/(game)/contracts/dev-alloc.tsx`

- [ ] **Step 1: Add InfoTip import**

At the top of `dev-alloc.tsx`, after the existing imports:
```typescript
import { InfoTip } from '@/components/info-tip'
```

- [ ] **Step 2: Add Monday nudge on the DEVELOP button**

In the `DevAllocPanel` component body (before the `return`), add:
```typescript
  const isMonday = new Date().getDay() === 1
```

Find the DEVELOP button (around line 92):
```tsx
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>
          DEVELOP {open ? '▲' : '▼'}
        </span>
```
Replace with:
```tsx
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>
          DEVELOP {open ? '▲' : '▼'}
        </span>
        {isMonday && playlist === 'none' && social === 'none' && (
          <span className="tag" style={{ color: 'var(--lime)', fontSize: 8, border: '1px solid rgba(200,255,58,0.35)', padding: '1px 6px', background: 'rgba(200,255,58,0.06)' }}>
            BUDGET AVAILABLE
          </span>
        )}
```

- [ ] **Step 3: Add InfoTip to PLAYLIST PITCHING label**

Find the PLAYLIST PITCHING label (around line 131):
```tsx
            <div className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9, marginBottom: 6 }}>
              PLAYLIST PITCHING — stream volume boost
            </div>
```
Replace with:
```tsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>PLAYLIST PITCHING — stream volume boost</span>
              <InfoTip text="Boosts total stream volume for 7 days. Multiplier applies to your royalty calculation. Re-allocate each Monday to keep it active." />
            </div>
```

- [ ] **Step 4: Add InfoTip to SOCIAL PUSH label**

Find the SOCIAL PUSH label (around line 167):
```tsx
            <div className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9, marginBottom: 6 }}>
              SOCIAL PUSH — velocity floor (defensive)
            </div>
```
Replace with:
```tsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>SOCIAL PUSH — velocity floor (defensive)</span>
              <InfoTip text="Sets a floor on how far streams can drop week-over-week. Doesn't boost revenue — it protects against decline. Use when momentum is at risk." />
            </div>
```

- [ ] **Step 5: Add InfoTip to RELEASE AMPLIFICATION label**

Find the RELEASE AMPLIFICATION label (around line 235):
```tsx
            <div className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9, marginBottom: 8 }}>
              RELEASE AMPLIFICATION — treasury spend · 14-day decay
            </div>
```
Replace with:
```tsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>RELEASE AMPLIFICATION — treasury spend · 14-day decay</span>
              <InfoTip text="One-time treasury spend when a new track drops. Peaks immediately and decays to 1× over 14 days. Stacks with playlist pitching up to the 1.60× hard cap." />
            </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/(game)/contracts/dev-alloc.tsx
git commit -m "feat: dev-alloc guidance — Monday nudge on DEVELOP button, InfoTips on all three sections"
```

---

## Task 5: Search page — empty roster banner

**Files:**
- Modify: `src/app/(game)/search/page.tsx`

- [ ] **Step 1: Add active contract count query**

In `SearchPage` (the main export), find the block that fetches scouts (around line 212):
```typescript
  const scoutData = await supabase
    .from('scouts').select('artist_id').eq('label_id', user.id).is('completed_at', null)
```

Run it in parallel with the contract count query by wrapping both in a `Promise.all`:
```typescript
  const [scoutData, { count: activeContractCount }] = await Promise.all([
    supabase.from('scouts').select('artist_id').eq('label_id', user.id).is('completed_at', null),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('label_id', user.id).eq('status', 'active'),
  ])
```

- [ ] **Step 2: Add the empty roster banner**

Find the `{!q && onRamps && (` block (around line 245). Add the banner at the very start of that block, before the first `<section>`:

```tsx
      {!q && onRamps && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {(activeContractCount ?? 0) === 0 && (
            <div style={{ background: 'rgba(200,255,58,0.04)', border: '1px solid rgba(200,255,58,0.3)', padding: '12px 16px' }}>
              <div className="tag" style={{ color: 'var(--lime)', fontSize: 9, letterSpacing: 1 }}>START HERE</div>
              <div style={{ color: 'var(--ink-mid)', fontSize: 11, marginTop: 3 }}>
                Browse the picks below or search by name. Sign your first artist to start earning royalties.
              </div>
            </div>
          )}
          {onRamps.trending && (
```

Close the outer `<div>` appropriately before the end of the `{!q && onRamps && (` block.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(game)/search/page.tsx
git commit -m "feat: search page — show START HERE banner when roster is empty"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] InfoTip component — Task 1
- [x] Dashboard: TREASURY/WEEKLY INCOME/REPUTATION InfoTips — Task 2, Step 6
- [x] Dashboard: Reputation progress sub-label — Task 2, Step 7
- [x] Dashboard: Monday chip "ALLOCATE NOW →" upgrade — Task 2, Step 8
- [x] Dashboard: Breaking alert banner (48h window) — Task 2, Steps 1, 9
- [x] Dashboard: Empty roster banner → SEARCH link — Task 2, Step 10
- [x] Artist: Momentum `localStorage` gate removed, replaced with persistent InfoTip — Task 3, Steps 4, 5, 6
- [x] Artist: 7D VELOCITY / CATALOG DEPTH / STREAMS/LISTENER InfoTips (Established+) — Task 3, Step 7
- [x] Artist: Signal tags block removed from modal — Task 3, Step 8
- [x] Artist: Scout nudge banner (!scout && !isContracted) — Task 3, Steps 1-2, 9
- [x] Contracts: Monday "BUDGET AVAILABLE" nudge on DEVELOP button — Task 4, Step 2
- [x] Contracts: PLAYLIST PITCHING InfoTip — Task 4, Step 3
- [x] Contracts: SOCIAL PUSH InfoTip — Task 4, Step 4
- [x] Contracts: RELEASE AMPLIFICATION InfoTip — Task 4, Step 5
- [x] Search: "START HERE" empty roster banner — Task 5

**No placeholders:** All steps include exact code. ✓

**Type consistency:** `InfoTip` is imported from `@/components/info-tip` and used with `text` prop in all tasks. ✓
