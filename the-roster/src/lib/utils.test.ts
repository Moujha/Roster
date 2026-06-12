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
