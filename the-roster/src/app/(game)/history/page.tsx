import { createClient } from '@/lib/supabase/server'
import type { LabelEvent } from '@/lib/types'
import { groupByWeek } from '@/lib/activity-helpers'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

const EVENT_ICONS: Record<string, string> = {
  royalty_paid: '$', artist_signed: '✍', contract_expired: '✗', tier_up: '↑', scout_completed: '◎',
  breaking_alert: '⚡',
}

const EVENT_COLORS: Record<string, string> = {
  royalty_paid: 'var(--lime)', artist_signed: 'var(--cyan)',
  contract_expired: 'var(--rose)', tier_up: 'var(--amber)', scout_completed: 'var(--amber)',
  breaking_alert: 'var(--amber)',
}

function fmtUSD(n: number) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtTime(dateStr: string) {
  const date = new Date(dateStr)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
  return `${weekday} ${time}`
}

function EventRow({ event }: { event: LabelEvent }) {
  const p = event.payload
  const color = EVENT_COLORS[event.event_type] ?? 'var(--ink-mid)'
  const icon = EVENT_ICONS[event.event_type] ?? '·'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{
        width: 28, height: 28, border: `1.5px solid ${color}`, background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 11, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        {event.event_type === 'royalty_paid' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>Royalty payment — {event.artist_name}</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              Royalty · {p.has_stream_data ? `${(p.multiplier as number).toFixed(1)}× engagement` : 'no stream data'}
            </div>
            <div className="tag" style={{ color: 'var(--lime)', fontSize: 11, marginTop: 4 }}>+{fmtUSD(p.amount as number)}</div>
          </>
        )}
        {event.event_type === 'artist_signed' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>Signed {event.artist_name}</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              {p.months as number}-month contract · {p.split_pct as number}% split
            </div>
            <div className="tag" style={{ color: 'var(--amber)', fontSize: 11, marginTop: 4 }}>{fmtUSD(p.signing_bonus as number)} signing bonus</div>
          </>
        )}
        {event.event_type === 'contract_expired' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>Contract ended — {event.artist_name}</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              {p.reason === 'dropped' ? 'Dropped' : 'Natural expiry'}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 5 }}>
              <div>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>Royalties </span>
                <span className="tag" style={{ color: 'var(--lime)', fontSize: 9 }}>{fmtUSD(p.total_royalties as number)}</span>
              </div>
              <div>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>Cost </span>
                <span className="tag" style={{ color: 'var(--amber)', fontSize: 9 }}>{fmtUSD(p.signing_bonus as number)}</span>
              </div>
              <div>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>Net P&L </span>
                <span className="tag" style={{ color: (p.net_pnl as number) >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 9 }}>
                  {fmtUSD(p.net_pnl as number)}
                </span>
              </div>
            </div>
          </>
        )}
        {event.event_type === 'tier_up' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>{event.artist_name} reached {p.new_tier as string} tier</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>Tier change · on your roster</div>
            <span className="tag" style={{
              display: 'inline-block', marginTop: 5,
              color: TIER_COLORS[p.new_tier as string] ?? 'var(--ink-mid)',
              border: `1px solid ${TIER_COLORS[p.new_tier as string] ?? 'var(--line)'}`,
              padding: '2px 6px', fontSize: 9,
            }}>{(p.new_tier as string).toUpperCase()}</span>
          </>
        )}
        {event.event_type === 'scout_completed' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-hi)', fontWeight: 600 }}>Scout complete — {event.artist_name}</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              Scout · {p.weeks_taken as number} weeks
            </div>
          </>
        )}
        {event.event_type === 'breaking_alert' && (
          <>
            <div style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>{event.artist_name} is breaking</div>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 3 }}>
              Stream velocity · +{(p.velocity as number).toFixed(1)}%
            </div>
          </>
        )}
      </div>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, flexShrink: 0, paddingTop: 2 }}>
        {fmtTime(event.created_at)}
      </div>
    </div>
  )
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('label_events')
    .select('*')
    .eq('label_id', user.id)
    .order('created_at', { ascending: false })

  const events = (data ?? []) as LabelEvent[]
  const weeks = groupByWeek(events)

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 760 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>ACTIVITY</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 24 }}>FEED</div>

      {weeks.length === 0 ? (
        <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>No activity yet — sign your first artist to get started.</div>
      ) : weeks.map(({ weekLabel, events: weekEvents }) => (
        <div key={weekLabel} style={{ marginBottom: 24 }}>
          <div className="tag" style={{
            color: 'var(--ink-low)', fontSize: 9, padding: '6px 0 8px',
            borderBottom: '1px solid var(--line-soft)', marginBottom: 2,
          }}>
            WEEK OF {weekLabel.toUpperCase()}
          </div>
          <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
            {weekEvents.map(e => <EventRow key={e.id} event={e} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
