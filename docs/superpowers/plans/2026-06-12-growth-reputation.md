# Growth Reputation at Contract Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a contract expires naturally, award reputation based on how much the artist grew during the label's term relative to their trajectory at signing — completing the §6.2.2/§6.2.3 reputation formula that currently only fires the flat +15.

**Architecture:** A pure `computeGrowthRepDelta` function is extracted to `src/lib/royalty.ts` (where the other royalty math lives), tested in isolation with Vitest, then imported by the weekly cron. The cron's Pass 2 (contract expiry) is updated to add `term_months` and `baseline_growth_pct` to its contracts query and to call the function before applying the final reputation update.

**Tech Stack:** Next.js 15 route handler (weekly cron), Supabase service client, Vitest, TypeScript

---

## GDD Reference (§6.2.2 / §6.2.3)

```
On contract completion:
  growth_contribution = actual_avg_monthly_growth% − baseline_monthly_growth%
  reputation_delta = +15 (completion, already implemented)
                   + min(growth_contribution, 40)   if growth_contribution > 0
                   − 10                             if growth_contribution < −20%
                   (floor 0, ceiling 1000)

Definitions:
  actual_avg_monthly_growth% = ((end_listeners − start_listeners) / start_listeners × 100) / term_months
  baseline_monthly_growth%   = listener_growth_28d recorded at signing (stored in contracts.baseline_growth_pct)
```

**Already implemented (do not duplicate):**
- +15 flat completion bonus → currently in weekly cron Pass 2
- +30 tier-up bonus → cron Pass 3
- +10 re-sign bonus → offer route `createContract`
- −20 early drop → `contracts/[id]/route.ts`

---

## File Map

| File | Change |
|------|--------|
| `the-roster/src/lib/royalty.ts` | Add `computeGrowthRepDelta` export |
| `the-roster/src/lib/royalty.test.ts` | Add 6 tests for `computeGrowthRepDelta` |
| `the-roster/src/app/api/royalties/weekly/route.ts` | Import + wire into Pass 2 |

---

## Task 1: computeGrowthRepDelta pure function (TDD)

**Files:**
- Modify: `the-roster/src/lib/royalty.ts`
- Modify: `the-roster/src/lib/royalty.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `the-roster/src/lib/royalty.test.ts` (after the existing `computeWeeklyRoyalties` describe block):

```typescript
import { computeGrowthRepDelta } from './royalty'

describe('computeGrowthRepDelta', () => {
  it('returns 0 when startListeners is 0 (divide-by-zero guard)', () => {
    expect(computeGrowthRepDelta(0, 100_000, 6, 5)).toBe(0)
  })

  it('returns 0 when termMonths is 0 (divide-by-zero guard)', () => {
    expect(computeGrowthRepDelta(100_000, 200_000, 0, 5)).toBe(0)
  })

  it('awards growth reputation when artist outperformed baseline', () => {
    // actualAvg = (120k / 100k * 100) / 6 = 20%/mo; baseline = 5%/mo; contribution = +15
    expect(computeGrowthRepDelta(100_000, 220_000, 6, 5)).toBe(15)
  })

  it('caps growth reputation at +40', () => {
    // actualAvg = (900k / 100k * 100) / 6 = 150%/mo; baseline = 0; contribution = 150 → capped 40
    expect(computeGrowthRepDelta(100_000, 1_000_000, 6, 0)).toBe(40)
  })

  it('returns 0 when growth contribution is negative but above -20%', () => {
    // actualAvg = (-10k / 100k * 100) / 6 = -1.67%/mo; baseline = 0; contribution = -1.67 → 0
    expect(computeGrowthRepDelta(100_000, 90_000, 6, 0)).toBe(0)
  })

  it('returns -10 when growth contribution is below -20%', () => {
    // actualAvg = (-60k / 100k * 100) / 1 = -60%/mo; baseline = 0; contribution = -60 → -10
    expect(computeGrowthRepDelta(100_000, 40_000, 1, 0)).toBe(-10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd the-roster && npx vitest run src/lib/royalty.test.ts
```

Expected: FAIL on the new `computeGrowthRepDelta` tests with "not a function" or similar import error. The existing tests still pass.

- [ ] **Step 3: Add computeGrowthRepDelta to royalty.ts**

Add at the end of `the-roster/src/lib/royalty.ts`:

```typescript
// §6.2.2/§6.2.3 — Reputation delta from listener growth relative to baseline at signing
export function computeGrowthRepDelta(
  startListeners: number,
  endListeners: number,
  termMonths: number,
  baselineGrowthPct: number,
): number {
  if (startListeners <= 0 || termMonths <= 0) return 0
  const actualAvgMonthlyGrowth = ((endListeners - startListeners) / startListeners * 100) / termMonths
  const contribution = actualAvgMonthlyGrowth - baselineGrowthPct
  if (contribution > 0) return Math.min(Math.round(contribution), 40)
  if (contribution < -20) return -10
  return 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd the-roster && npx vitest run src/lib/royalty.test.ts
```

Expected: all tests pass (existing tests + 6 new ones = at least 11 total in this file)

- [ ] **Step 5: Commit**

```bash
cd the-roster && git add src/lib/royalty.ts src/lib/royalty.test.ts
git commit -m "feat: computeGrowthRepDelta utility for contract expiry reputation"
```

---

## Task 2: Wire into weekly cron Pass 2

**Files:**
- Modify: `the-roster/src/app/api/royalties/weekly/route.ts`

### Context

The cron currently has this contracts query (near the top):

```typescript
const { data: contracts } = await supabase
  .from('contracts')
  .select('id, label_id, artist_id, rev_split_label_pct, end_date, signing_bonus, dev_spend_total, baseline_listeners, royalties_paid_through')
  .eq('status', 'active')
```

And Pass 2 ends with this reputation block (the part you're replacing):

```typescript
// Reputation +15 for natural completion
const { data: lbl15 } = await supabase.from('labels').select('reputation').eq('id', c.label_id).single()
await supabase.from('labels').update({ reputation: Math.max(0, (lbl15?.reputation ?? 0) + 15) }).eq('id', c.label_id)
```

And the `label_history` insert uses `listenersMap.get(c.artist_id) ?? null` for `listeners_at_end`.

The existing `listenersMap` is populated during Pass 1 for all contracts that had royalties computed. If a contract was already paid through today (skipped in Pass 1), its artist won't be in the map — handle with a fallback fetch.

The import at the top currently imports from `@/lib/royalty`:
```typescript
import {
  computeEngagementMultiplier, computeWeeklyRoyalties,
  computeReleaseMultiplier, computeCombinedMultiplier,
  DEV_BUDGET_PCT, DEV_COST_PCT, SOCIAL_FLOOR_PCTS,
  type DevTier,
} from '@/lib/royalty'
```

- [ ] **Step 1: Add computeGrowthRepDelta to the import**

Change the import to:

```typescript
import {
  computeEngagementMultiplier, computeWeeklyRoyalties,
  computeReleaseMultiplier, computeCombinedMultiplier,
  computeGrowthRepDelta,
  DEV_BUDGET_PCT, DEV_COST_PCT, SOCIAL_FLOOR_PCTS,
  type DevTier,
} from '@/lib/royalty'
```

- [ ] **Step 2: Add term_months and baseline_growth_pct to the contracts select**

Change:

```typescript
.select('id, label_id, artist_id, rev_split_label_pct, end_date, signing_bonus, dev_spend_total, baseline_listeners, royalties_paid_through')
```

To:

```typescript
.select('id, label_id, artist_id, rev_split_label_pct, end_date, signing_bonus, dev_spend_total, baseline_listeners, baseline_growth_pct, term_months, royalties_paid_through')
```

- [ ] **Step 3: Replace the Pass 2 listeners_at_end and reputation block**

In Pass 2's for-loop, replace two things:

**3a. Replace the `label_history` insert's `listeners_at_end` field.** The current line is:

```typescript
    listeners_at_end: listenersMap.get(c.artist_id) ?? null,
```

Before the `label_history` insert (after `if (expireErr) continue`), add a fallback fetch and replace the inline lookup:

```typescript
    // Resolve end listeners — prefer listenersMap (populated in Pass 1), else fetch
    let endListeners = listenersMap.get(c.artist_id) ?? null
    if (endListeners === null) {
      const { data: latestStats } = await supabase
        .from('artist_stats_daily')
        .select('monthly_listeners')
        .eq('artist_id', c.artist_id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      endListeners = latestStats?.monthly_listeners ?? null
    }
```

And update the `label_history` insert to use `endListeners`:

```typescript
      listeners_at_end: endListeners,
```

**3b. Replace the reputation update block.** The current block (at the very end of the Pass 2 for-loop):

```typescript
    // Reputation +15 for natural completion
    const { data: lbl15 } = await supabase.from('labels').select('reputation').eq('id', c.label_id).single()
    await supabase.from('labels').update({ reputation: Math.max(0, (lbl15?.reputation ?? 0) + 15) }).eq('id', c.label_id)
```

Replace with:

```typescript
    // Reputation: +15 completion + growth contribution (§6.2.2/§6.2.3)
    const growthRepDelta = (c.baseline_listeners != null && endListeners !== null)
      ? computeGrowthRepDelta(
          c.baseline_listeners,
          endListeners,
          (c as unknown as { term_months: number }).term_months ?? 6,
          (c as unknown as { baseline_growth_pct: number | null }).baseline_growth_pct ?? 0,
        )
      : 0
    const { data: lbl15 } = await supabase.from('labels').select('reputation').eq('id', c.label_id).single()
    const newRep = Math.min(1000, Math.max(0, (lbl15?.reputation ?? 0) + 15 + growthRepDelta))
    await supabase.from('labels').update({ reputation: newRep }).eq('id', c.label_id)
```

**Why the `as unknown as` cast?** Supabase's TypeScript inference doesn't automatically type the extra selected columns on the `contracts` query result — it infers from the original select string at the call site. The cast lets us access the newly selected fields without a full TS refactor of the query return type.

- [ ] **Step 4: Type-check**

```bash
cd the-roster && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run full test suite**

```bash
cd the-roster && npx vitest run
```

Expected: all tests pass (52 existing + 6 new = 58 total)

- [ ] **Step 6: Commit**

```bash
cd the-roster && git add src/app/api/royalties/weekly/route.ts
git commit -m "feat: growth-based reputation at contract expiry"
```
