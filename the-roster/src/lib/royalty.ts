export const BASE_RATE = 0.000175
export const DEV_BUDGET_PCT = 0.12  // 12% of weekly royalties

export type DevTier = 'none' | 'light' | 'standard' | 'heavy'

export const PLAYLIST_MULTIPLIERS: Record<DevTier, number> = {
  none: 1.0, light: 1.08, standard: 1.15, heavy: 1.22,
}

// Stream floor as fraction of prior-week streams (0 = no floor enforced)
export const SOCIAL_FLOOR_PCTS: Record<DevTier, number> = {
  none: 0, light: 0.95, standard: 0.98, heavy: 1.00,
}

export const RELEASE_PEAKS: Record<'light' | 'standard' | 'heavy', number> = {
  light: 1.20, standard: 1.35, heavy: 1.50,
}

// Cost as fraction of weekly dev budget
export const DEV_COST_PCT: Record<DevTier, number> = {
  none: 0, light: 0.25, standard: 0.50, heavy: 1.00,
}

// Release amplification spend multiplier (cost = devBudget × this)
export const RELEASE_COST_MULT = { light: 1, standard: 2, heavy: 3 }

export function computeEngagementMultiplier(
  monthlyListeners: number,
  actualWeeklyStreams: number | null,
): number {
  if (actualWeeklyStreams === null || monthlyListeners === 0) return 1.0
  const expected = monthlyListeners / 4
  return Math.min(3.0, Math.max(0.5, actualWeeklyStreams / expected))
}

export function computeWeeklyRoyalties(
  monthlyListeners: number,
  revSplitLabelPct: number,
  actualWeeklyStreams: number | null,
): number {
  const base = monthlyListeners * BASE_RATE * (revSplitLabelPct / 100)
  const multiplier = computeEngagementMultiplier(monthlyListeners, actualWeeklyStreams)
  return Math.round(base * multiplier * 100) / 100
}

// Linear decay from peak to 1.0 over 14 days
export function computeReleaseMultiplier(peakMultiplier: number, daysSinceTriggered: number): number {
  if (daysSinceTriggered >= 14) return 1.0
  return 1.0 + (peakMultiplier - 1.0) * (1 - daysSinceTriggered / 14)
}

// Combined playlist × release multiplier, hard-capped at 1.60×
export function computeCombinedMultiplier(playlistTier: DevTier, releaseMultiplier: number): number {
  return Math.min(PLAYLIST_MULTIPLIERS[playlistTier] * releaseMultiplier, 1.60)
}

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
