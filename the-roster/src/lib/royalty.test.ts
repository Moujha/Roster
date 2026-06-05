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
