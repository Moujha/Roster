import { describe, it, expect } from 'vitest'
import {
  computeEngagementMultiplier, computeWeeklyRoyalties, computeGrowthRepDelta,
  computeReleaseMultiplier, computeCombinedMultiplier,
} from './royalty'

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
    // 100K × 0.035 × 0.5 × 1.0 = 1750
    expect(computeWeeklyRoyalties(100_000, 50, null)).toBe(1750)
  })

  it('doubles royalties for 2× engagement', () => {
    // multiplier = 2.0 → 1750 × 2 = 3500
    expect(computeWeeklyRoyalties(100_000, 50, 50_000)).toBe(3500)
  })

  it('caps at 3× for extreme engagement', () => {
    // multiplier = 3.0 → 1750 × 3 = 5250
    expect(computeWeeklyRoyalties(100_000, 50, 200_000)).toBe(5250)
  })

  it('applies rev split correctly', () => {
    // 100K × 0.035 × 0.25 = 875
    expect(computeWeeklyRoyalties(100_000, 25, null)).toBe(875)
  })
})

describe('computeReleaseMultiplier', () => {
  it('returns peak on day 0', () => {
    expect(computeReleaseMultiplier(1.50, 0)).toBeCloseTo(1.50, 5)
  })

  it('returns 1.0 at day 14 (fully decayed)', () => {
    expect(computeReleaseMultiplier(1.50, 14)).toBe(1.0)
  })

  it('returns 1.0 beyond day 14', () => {
    expect(computeReleaseMultiplier(1.50, 20)).toBe(1.0)
  })

  it('decays linearly to midpoint at day 7', () => {
    // peak=1.50, day 7 → 1.0 + 0.50 * (1 - 7/14) = 1.25
    expect(computeReleaseMultiplier(1.50, 7)).toBeCloseTo(1.25, 5)
  })
})

describe('computeCombinedMultiplier', () => {
  it('returns playlist multiplier when no release (releaseMultiplier=1.0)', () => {
    expect(computeCombinedMultiplier('heavy', 1.0)).toBeCloseTo(1.22, 5)
  })

  it('multiplies playlist × release within cap', () => {
    // light playlist (1.08) × light release peak (1.20) = 1.296 < 1.60 → no cap
    expect(computeCombinedMultiplier('light', 1.20)).toBeCloseTo(1.296, 3)
  })

  it('caps at 1.60 when product would exceed it (§5.5)', () => {
    // heavy playlist (1.22) × heavy release peak (1.50) = 1.83 → capped 1.60
    expect(computeCombinedMultiplier('heavy', 1.50)).toBe(1.60)
  })

  it('returns 1.0 for none playlist and no release', () => {
    expect(computeCombinedMultiplier('none', 1.0)).toBe(1.0)
  })
})

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
