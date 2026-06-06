import { describe, it, expect } from 'vitest'
import {
  scoutDurationWeeks,
  classifyPattern,
  estimateBonus,
  momentumConfidence,
} from './scout-helpers'

describe('scoutDurationWeeks', () => {
  it('returns base durations with no reductions', () => {
    expect(scoutDurationWeeks('underground', false, false)).toBe(8)
    expect(scoutDurationWeeks('emerging', false, false)).toBe(6)
    expect(scoutDurationWeeks('rising', false, false)).toBe(4)
    expect(scoutDurationWeeks('established', false, false)).toBe(3)
  })

  it('applies affinity reduction: ceil(base × 0.2)', () => {
    // underground: 8 - ceil(1.6)=2 = 6
    expect(scoutDurationWeeks('underground', false, true)).toBe(6)
    // emerging: 6 - ceil(1.2)=2 = 4
    expect(scoutDurationWeeks('emerging', false, true)).toBe(4)
    // rising: 4 - ceil(0.8)=1 = 3
    expect(scoutDurationWeeks('rising', false, true)).toBe(3)
    // established: 3 - ceil(0.6)=1 = 2
    expect(scoutDurationWeeks('established', false, true)).toBe(2)
  })

  it('applies discovery reduction of 1 week', () => {
    expect(scoutDurationWeeks('underground', true, false)).toBe(7)
    expect(scoutDurationWeeks('established', true, false)).toBe(2)
  })

  it('stacks both reductions', () => {
    // underground: 8 - 2 - 1 = 5
    expect(scoutDurationWeeks('underground', true, true)).toBe(5)
  })

  it('never goes below 1 week', () => {
    // established with both: 3 - 1 - 1 = 1
    expect(scoutDurationWeeks('established', true, true)).toBe(1)
  })
})

describe('classifyPattern', () => {
  it('returns mixed with fewer than 3 non-null rows', () => {
    expect(classifyPattern([{ daily_streams_top10: 1000 }, { daily_streams_top10: 2000 }])).toBe('mixed')
  })

  it('returns mixed when all rows are null', () => {
    expect(classifyPattern([
      { daily_streams_top10: null },
      { daily_streams_top10: null },
      { daily_streams_top10: null },
    ])).toBe('mixed')
  })

  it('returns organic for flat streams (CV < 0.30)', () => {
    const rows = Array(5).fill({ daily_streams_top10: 1000 })
    expect(classifyPattern(rows)).toBe('organic')
  })

  it('returns spike for high variance with max > 3 × mean', () => {
    // 9×100 + 1×1000: mean=190, stddev=270, cv≈1.42, max=1000 > 3×190=570
    const rows = [
      ...Array(9).fill({ daily_streams_top10: 100 }),
      { daily_streams_top10: 1000 },
    ]
    expect(classifyPattern(rows)).toBe('spike')
  })

  it('returns mixed when CV > 0.80 but max ≤ 3 × mean', () => {
    // [1,2,3,50,40,30]: mean=21, cv≈0.95, max=50 < 3×21=63
    const rows = [1, 2, 3, 50, 40, 30].map(v => ({ daily_streams_top10: v }))
    expect(classifyPattern(rows)).toBe('mixed')
  })

  it('only uses up to 14 rows', () => {
    // 14 identical + 1 huge outlier → if only 14 used, result is organic
    const rows = [
      ...Array(14).fill({ daily_streams_top10: 1000 }),
      { daily_streams_top10: 999_999 },
    ]
    expect(classifyPattern(rows)).toBe('organic')
  })
})

describe('estimateBonus', () => {
  it('returns bonus_min at tier minimum listeners', () => {
    expect(estimateBonus('underground', 0)).toBe(500)
    expect(estimateBonus('emerging', 50_000)).toBe(5_000)
  })

  it('returns bonus_max at tier maximum listeners', () => {
    expect(estimateBonus('underground', 50_000)).toBe(2_000)
    expect(estimateBonus('established', 10_000_000)).toBe(300_000)
  })

  it('interpolates at midpoint', () => {
    // underground midpoint 25K: position=0.5, estimate=round(500+750)=1250
    expect(estimateBonus('underground', 25_000)).toBe(1_250)
    // emerging midpoint 275K: position=0.5, estimate=round(5000+7500)=12500
    expect(estimateBonus('emerging', 275_000)).toBe(12_500)
  })

  it('clamps below tier minimum to bonus_min', () => {
    expect(estimateBonus('underground', -500)).toBe(500)
  })

  it('clamps above tier maximum to bonus_max', () => {
    expect(estimateBonus('underground', 100_000)).toBe(2_000)
  })
})

describe('momentumConfidence', () => {
  it('returns stable for null', () => {
    expect(momentumConfidence(null)).toBe('stable')
  })

  it('returns stable for |growth| < 5', () => {
    expect(momentumConfidence(0)).toBe('stable')
    expect(momentumConfidence(4.9)).toBe('stable')
    expect(momentumConfidence(-4.9)).toBe('stable')
  })

  it('returns moderate for |growth| in [5, 15]', () => {
    expect(momentumConfidence(5)).toBe('moderate')
    expect(momentumConfidence(15)).toBe('moderate')
    expect(momentumConfidence(-10)).toBe('moderate')
  })

  it('returns volatile for |growth| > 15', () => {
    expect(momentumConfidence(15.1)).toBe('volatile')
    expect(momentumConfidence(-20)).toBe('volatile')
  })
})
