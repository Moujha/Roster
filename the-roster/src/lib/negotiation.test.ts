import { describe, it, expect } from 'vitest'
import { repNegParams, bonusScore, splitScore, termScore, computeOfferScore } from './negotiation'
import type { PriorityWeights } from './negotiation'

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

describe('bonusScore', () => {
  it('floor offer scores 0', () => {
    expect(bonusScore(500, 'underground')).toBe(0)
  })

  it('top offer scores 100', () => {
    expect(bonusScore(2_000, 'underground')).toBe(100)
  })

  it('mid-range offer scores ~50', () => {
    expect(bonusScore(1_250, 'underground')).toBeCloseTo(50, 0)
  })

  it('clamps below floor to 0', () => {
    expect(bonusScore(0, 'underground')).toBe(0)
  })

  it('clamps above ceiling to 100', () => {
    expect(bonusScore(999_999, 'emerging')).toBe(100)
  })
})

describe('splitScore', () => {
  it('label_pct=20 (most artist-friendly) → 100', () => {
    expect(splitScore(20)).toBe(100)
  })

  it('label_pct=40 (most label-friendly) → 0', () => {
    expect(splitScore(40)).toBe(0)
  })

  it('label_pct=30 (midpoint) → 50', () => {
    expect(splitScore(30)).toBe(50)
  })
})

describe('termScore', () => {
  const freedomDom: PriorityWeights = { money: 0.1, freedom: 0.7, commitment: 0.2 }
  const commitDom: PriorityWeights = { money: 0.1, freedom: 0.2, commitment: 0.7 }

  it('freedom-dominant: 3mo = 100', () => {
    expect(termScore(3, freedomDom)).toBe(100)
  })

  it('freedom-dominant: 12mo = 0', () => {
    expect(termScore(12, freedomDom)).toBe(0)
  })

  it('commitment-dominant: 12mo = 100', () => {
    expect(termScore(12, commitDom)).toBe(100)
  })

  it('commitment-dominant: 3mo = 0', () => {
    expect(termScore(3, commitDom)).toBe(0)
  })

  it('6mo always scores 50 regardless of dominant', () => {
    expect(termScore(6, freedomDom)).toBe(50)
    expect(termScore(6, commitDom)).toBe(50)
  })
})

describe('computeOfferScore', () => {
  it('money-dominant artist: max bonus offer scores highest on bonus axis', () => {
    const moneyWeights: PriorityWeights = { money: 0.7, freedom: 0.15, commitment: 0.15 }
    const maxOffer = { bonus: 2_000, rev_split_label_pct: 30, term_months: 6 as const }
    const minOffer = { bonus: 500, rev_split_label_pct: 30, term_months: 6 as const }
    expect(computeOfferScore(maxOffer, moneyWeights, 'underground'))
      .toBeGreaterThan(computeOfferScore(minOffer, moneyWeights, 'underground'))
  })

  it('freedom-dominant artist: artist-friendly split scores higher', () => {
    const freedomWeights: PriorityWeights = { money: 0.15, freedom: 0.7, commitment: 0.15 }
    const friendlyOffer = { bonus: 1_000, rev_split_label_pct: 20, term_months: 6 as const }
    const greedyOffer   = { bonus: 1_000, rev_split_label_pct: 40, term_months: 6 as const }
    expect(computeOfferScore(friendlyOffer, freedomWeights, 'underground'))
      .toBeGreaterThan(computeOfferScore(greedyOffer, freedomWeights, 'underground'))
  })
})
