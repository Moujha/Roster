import { describe, it, expect } from 'vitest'
import { describeEvent, getWeekLabel, groupByWeek } from './activity-helpers'
import type { LabelEvent } from './types'

function makeEvent(overrides: Partial<LabelEvent> = {}): LabelEvent {
  return {
    id: '1',
    label_id: 'l1',
    event_type: 'royalty_paid',
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

  it('formats scout_completed', () => {
    const e = makeEvent({ event_type: 'scout_completed', payload: { weeks_taken: 4 } })
    expect(describeEvent(e)).toBe('Scout complete — Aya Nakamura')
  })

  it('formats release_boost', () => {
    const e = makeEvent({ event_type: 'release_boost', payload: { spend_tier: 'heavy' } })
    expect(describeEvent(e)).toBe('Release boost activated — Aya Nakamura · heavy')
  })

  it('formats breaking_alert', () => {
    const e = makeEvent({ event_type: 'breaking_alert', payload: { velocity: 42.7, threshold: 25 } })
    expect(describeEvent(e)).toBe('Aya Nakamura is breaking — +42.7% velocity')
  })

  it('formats contract_expired when dropped', () => {
    const e = makeEvent({
      event_type: 'contract_expired',
      payload: { net_pnl: -500, total_royalties: 700, signing_bonus: 1200, reason: 'dropped' },
    })
    expect(describeEvent(e)).toBe('Dropped — Aya Nakamura · -$500')
  })
})

describe('getWeekLabel', () => {
  it('returns the Monday of the week for a Friday', () => {
    // 2026-06-05 is a Friday; Monday of that week is Jun 1
    expect(getWeekLabel('2026-06-05T08:00:00Z')).toBe('Jun 1, 2026')
  })

  it('returns the same date for a Monday', () => {
    expect(getWeekLabel('2026-06-01T08:00:00Z')).toBe('Jun 1, 2026')
  })

  it('handles Sunday (maps to previous Monday)', () => {
    // 2026-06-07 is a Sunday; Monday of that week is Jun 1
    expect(getWeekLabel('2026-06-07T08:00:00Z')).toBe('Jun 1, 2026')
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
    expect(groups[0].weekLabel).toBe('Jun 1, 2026')
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
