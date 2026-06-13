import type { Tier } from './types'

const BASE_DURATIONS: Partial<Record<Tier, number>> = {
  underground: 8, emerging: 6, rising: 4, established: 3,
}

export function scoutDurationWeeks(
  tier: Tier, isDiscovery: boolean, hasAffinity: boolean,
): number {
  const base = BASE_DURATIONS[tier] ?? 8
  const affinityReduction = hasAffinity ? Math.ceil(base * 0.2) : 0
  const discoveryReduction = isDiscovery ? 1 : 0
  return Math.max(1, base - affinityReduction - discoveryReduction)
}

function stdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function classifyPattern(
  streamRows: { daily_streams_top10: number | null }[],
): 'organic' | 'spike' | 'mixed' {
  const values = streamRows
    .filter(r => r.daily_streams_top10 !== null)
    .map(r => r.daily_streams_top10 as number)
    .slice(0, 14)
  if (values.length < 3) return 'mixed'
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 'mixed'
  const cv = stdDev(values) / mean
  const max = Math.max(...values)
  if (cv < 0.30) return 'organic'
  if (cv > 0.80 && max > 3 * mean) return 'spike'
  return 'mixed'
}

const TIER_RANGES: Partial<Record<Tier, {
  min: number; max: number; bonusMin: number; bonusMax: number
}>> = {
  underground: { min: 0, max: 50_000, bonusMin: 500, bonusMax: 2_000 },
  emerging:    { min: 50_000, max: 500_000, bonusMin: 5_000, bonusMax: 20_000 },
  rising:      { min: 500_000, max: 2_000_000, bonusMin: 20_000, bonusMax: 80_000 },
  established: { min: 2_000_000, max: 10_000_000, bonusMin: 80_000, bonusMax: 300_000 },
}

export function estimateBonus(tier: Tier, monthlyListeners: number): { estimate: number; margin: number } {
  const r = TIER_RANGES[tier]
  if (!r) return { estimate: 0, margin: 0 }
  const position = Math.max(0, Math.min(1, (monthlyListeners - r.min) / (r.max - r.min)))
  const estimate = Math.round(r.bonusMin + position * (r.bonusMax - r.bonusMin))
  const margin = Math.round(estimate * 0.15)
  return { estimate, margin }
}

export function momentumConfidence(
  growth28d: number | null,
): 'stable' | 'moderate' | 'volatile' {
  if (growth28d === null) return 'stable'
  const abs = Math.abs(growth28d)
  if (abs < 5) return 'stable'
  if (abs <= 15) return 'moderate'
  return 'volatile'
}
