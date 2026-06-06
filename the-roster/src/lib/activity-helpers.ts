import type { LabelEvent } from './types'

export function describeEvent(e: LabelEvent): string {
  const p = e.payload
  switch (e.event_type) {
    case 'royalty_paid':
      return `Earned $${(p.amount as number).toFixed(2)} from ${e.artist_name}`
    case 'artist_signed':
      return `Signed ${e.artist_name} · ${p.months}mo deal`
    case 'contract_expired': {
      const pnl = p.net_pnl as number
      return `Contract ended — ${e.artist_name} · ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(0)}`
    }
    case 'tier_up':
      return `${e.artist_name} reached ${p.new_tier} tier`
    case 'scout_completed':
      return `Scout complete — ${e.artist_name}`
    default:
      return e.artist_name
  }
}

export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400_000)
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  return `${diffDays}d ago`
}

export function getWeekLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getUTCDay() // 0=Sun, 1=Mon, …
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() + diff)
  return monday.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function groupByWeek(
  events: LabelEvent[],
): Array<{ weekLabel: string; events: LabelEvent[] }> {
  const groups = new Map<string, LabelEvent[]>()
  for (const e of events) {
    const label = getWeekLabel(e.created_at)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(e)
  }
  return Array.from(groups.entries()).map(([weekLabel, evts]) => ({ weekLabel, events: evts }))
}
