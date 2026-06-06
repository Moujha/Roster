export const BASE_RATE = 0.000175

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
