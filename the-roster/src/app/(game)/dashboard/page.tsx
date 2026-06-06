import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Label, Contract, LabelEvent } from '@/lib/types'
import { describeEvent, relativeTime } from '@/lib/activity-helpers'

type ContractRow = Contract & { artists: { name: string; tier: string; spotify_id: string } }

async function getDashboardData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [labelRes, contractsRes, eventsRes] = await Promise.all([
    supabase.from('labels').select('*').eq('id', user.id).single(),
    supabase.from('contracts')
      .select('*, artists(name, tier, spotify_id)')
      .eq('label_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('label_events')
      .select('*')
      .eq('label_id', user.id)
      .order('created_at', { ascending: false })
      .limit(8),
  ])
  return {
    label: labelRes.data as Label,
    contracts: (contractsRes.data ?? []) as ContractRow[],
    events: (eventsRes.data ?? []) as LabelEvent[],
  }
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function weeksLeft(endDate: string) {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (7 * 86_400_000)))
}

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

const EVENT_COLORS: Record<string, string> = {
  royalty_paid: 'var(--lime)',
  artist_signed: 'var(--cyan)',
  contract_expired: 'var(--rose)',
  tier_up: 'var(--amber)',
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  if (!data) return null
  const { label, contracts, events } = data
  const active = contracts.filter(c => c.status === 'active')
  const expired = contracts.filter(c => c.status === 'expired')

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>LABEL HQ</div>
          <div className="display" style={{ fontSize: 36, color: 'var(--ink-hi)', lineHeight: 0.9 }}>{label.label_name}</div>
        </div>
        <Link href="/search" style={{
          fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px 16px',
          border: '2px solid var(--lime)', color: 'var(--lime)',
          background: 'rgba(200,255,58,0.08)', textDecoration: 'none', letterSpacing: 1,
        }}>+ SIGN ARTIST</Link>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 16 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>TREASURY</div>
          <div className="display" style={{ fontSize: 42, color: 'var(--amber)', lineHeight: 1, marginTop: 6 }}>{fmtUSD(label.treasury)}</div>
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 16 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROYALTIES EARNED</div>
          {active.length === 0
            ? <div style={{ color: 'var(--ink-mid)', fontSize: 12, marginTop: 8 }}>Sign your first artist to start earning</div>
            : <div className="display" style={{ fontSize: 42, color: 'var(--lime)', lineHeight: 1, marginTop: 6 }}>
                {fmtUSD(active.reduce((s, c) => s + c.royalties_earned, 0))}
              </div>
          }
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 16 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROSTER</div>
          <div className="display" style={{ fontSize: 42, color: active.length >= 5 ? 'var(--rose)' : 'var(--cyan)', lineHeight: 1, marginTop: 6 }}>
            {active.length} / 5
          </div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 4 }}>
            {active.length >= 5 ? 'ROSTER FULL' : `${5 - active.length} SLOTS OPEN`}
          </div>
        </div>
      </div>

      {/* Expired banner */}
      {expired.length > 0 && (
        <div style={{ background: 'rgba(255,84,120,0.06)', border: '2px solid var(--rose)', padding: '12px 16px', marginBottom: 16 }}>
          <div className="tag" style={{ color: 'var(--rose)', fontSize: 10, marginBottom: 10 }}>
            {expired.length} CONTRACT{expired.length > 1 ? 'S' : ''} EXPIRED
          </div>
          {expired.map(c => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0', borderTop: '1px solid rgba(255,84,120,0.2)',
            }}>
              <div>
                <span style={{ color: 'var(--ink-hi)', fontSize: 13 }}>{c.artists.name}</span>
                <span className="tag" style={{ color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 9, marginLeft: 8, border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 4px' }}>
                  {c.artists.tier.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={`/artist/${c.artists.spotify_id}`} style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '4px 10px',
                  border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
                }}>RE-SIGN</Link>
                <Link href="/contracts" style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '4px 10px',
                  border: '1px solid var(--rose)', color: 'var(--rose)', textDecoration: 'none',
                }}>RELEASE</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Two-column: roster + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* Left: Active roster */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          <div style={{ padding: '8px 16px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>ACTIVE ROSTER</span>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{active.length} ARTISTS</span>
          </div>
          {active.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--ink-mid)', fontSize: 13, marginBottom: 16 }}>Your roster is empty</div>
              <Link href="/search" style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px',
                border: '2px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
              }}>SIGN YOUR FIRST ARTIST</Link>
            </div>
          ) : active.map(c => {
            const wl = weeksLeft(c.end_date)
            const netPnl = c.royalties_earned - c.signing_bonus - c.dev_spend_total
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px 80px auto',
                gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line-soft)',
                alignItems: 'center',
              }}>
                <div>
                  <Link href={`/artist/${c.artists.spotify_id}`} style={{ color: 'var(--ink-hi)', textDecoration: 'none', fontSize: 14 }}>
                    {c.artists.name}
                  </Link>
                  <div style={{ marginTop: 3 }}>
                    <span className="tag" style={{
                      color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 9,
                      border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 5px',
                      background: `${TIER_COLORS[c.artists.tier] ?? 'transparent'}18`,
                    }}>{c.artists.tier.toUpperCase()}</span>
                  </div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>WEEKS LEFT</div>
                  <div className="tag" style={{ color: wl <= 2 ? 'var(--rose)' : 'var(--ink-hi)', fontSize: 13, marginTop: 2 }}>{wl}</div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>ROYALTIES</div>
                  <div className="tag" style={{ color: 'var(--lime)', fontSize: 13, marginTop: 2 }}>{fmtUSD(c.royalties_earned)}</div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>NET P&L</div>
                  <div className="tag" style={{ color: netPnl >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 13, marginTop: 2 }}>{netPnl >= 0 ? '+' : ''}{fmtUSD(netPnl)}</div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>SPLIT</div>
                  <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 13, marginTop: 2 }}>{c.rev_split_label_pct}%</div>
                </div>
                <Link href="/contracts" style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '5px 10px',
                  border: '1px solid var(--line)', color: 'var(--ink-mid)', textDecoration: 'none',
                }}>MANAGE</Link>
              </div>
            )
          })}
        </div>

        {/* Right: Activity widget */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          <div style={{ padding: '8px 14px', borderBottom: '2px solid var(--line)' }}>
            <span className="tag" style={{ color: 'var(--lime)', fontSize: 10 }}>RECENT ACTIVITY</span>
          </div>
          {events.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--ink-mid)', fontSize: 12 }}>No activity yet</div>
          ) : events.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--line-soft)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: EVENT_COLORS[e.event_type], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {describeEvent(e)}
                </div>
              </div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, flexShrink: 0 }}>
                {relativeTime(e.created_at)}
              </div>
            </div>
          ))}
          <div style={{ padding: '8px 14px' }}>
            <Link href="/history" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--ink-low)', textDecoration: 'none', letterSpacing: 1 }}>
              VIEW ALL →
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
