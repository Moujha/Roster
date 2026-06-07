import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Contract, DevAllocation, ReleaseAmplification } from '@/lib/types'
import { computeWeeklyRoyalties } from '@/lib/royalty'
import { ReleaseButton, DropButton } from './actions'
import { DevAllocPanel } from './dev-alloc'

type ContractRow = Contract & { artists: { name: string; tier: string; spotify_id: string } }

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)', major: 'var(--rose)',
}

function fmtUSD(n: number) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function weeksLeft(endDate: string) {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (7 * 86_400_000)))
}

export default async function ContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('contracts')
    .select('*, artists(name, tier, spotify_id)')
    .eq('label_id', user.id)
    .order('created_at', { ascending: false })

  const contracts = (data ?? []) as ContractRow[]
  const active = contracts.filter(c => c.status === 'active')
  const expired = contracts.filter(c => c.status === 'expired')

  // Fetch dev state for active contracts
  const today = new Date().toISOString().slice(0, 10)
  const activeIds = active.map(c => c.id)
  const activeArtistIds = active.map(c => c.artist_id)

  const [devAllocsRes, releaseAmpsRes, statsRes] = await Promise.all([
    activeIds.length
      ? supabase.from('dev_allocations').select('*').in('contract_id', activeIds)
      : Promise.resolve({ data: [] }),
    activeIds.length
      ? supabase.from('release_amplifications').select('*').in('contract_id', activeIds).gte('expires_at', today)
      : Promise.resolve({ data: [] }),
    activeArtistIds.length
      ? supabase.from('artist_stats_daily').select('artist_id, monthly_listeners, date').in('artist_id', activeArtistIds).order('date', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const allocMap = new Map<string, DevAllocation>(
    ((devAllocsRes.data ?? []) as DevAllocation[]).map(a => [a.contract_id, a]),
  )
  const releaseMap = new Map<string, ReleaseAmplification>(
    ((releaseAmpsRes.data ?? []) as ReleaseAmplification[]).map(r => [r.contract_id, r]),
  )

  // Latest listeners per artist
  const listenerMap = new Map<string, number>()
  for (const row of (statsRes.data ?? []) as { artist_id: string; monthly_listeners: number | null; date: string }[]) {
    if (!listenerMap.has(row.artist_id) && row.monthly_listeners) {
      listenerMap.set(row.artist_id, row.monthly_listeners)
    }
  }

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 900 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>CONTRACTS</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 24 }}>MANAGE ROSTER</div>

      {/* Expired */}
      {expired.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="tag" style={{ color: 'var(--rose)', fontSize: 10, marginBottom: 10 }}>
            EXPIRED -- ACTION REQUIRED
          </div>
          {expired.map(c => {
            if (!c.artists) return null
            const tc = TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)'
            return (
              <div key={c.id} style={{
                background: 'rgba(255,84,120,0.04)', border: '2px solid var(--rose)',
                padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span style={{ color: 'var(--ink-hi)', fontSize: 14 }}>{c.artists.name}</span>
                  <span className="tag" style={{ color: tc, fontSize: 9, marginLeft: 8, border: `1px solid ${tc}`, padding: '1px 5px', background: `${tc}18` }}>
                    {c.artists.tier.toUpperCase()}
                  </span>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 4 }}>
                    Ended {fmtDate(c.end_date)} · Royalties: {fmtUSD(c.royalties_earned)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/artist/${c.artists.spotify_id}`} style={{
                    fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '5px 10px',
                    border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
                  }}>RE-SIGN</Link>
                  <ReleaseButton contractId={c.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Active */}
      <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
        <div style={{ padding: '8px 16px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>ACTIVE CONTRACTS</span>
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{active.length} / 5</span>
        </div>
        {active.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-mid)', fontSize: 13 }}>
            No active contracts. <Link href="/search" style={{ color: 'var(--lime)' }}>Find an artist</Link>
          </div>
        ) : active.map(c => {
          if (!c.artists) return null
          const tc = TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)'
          const netPnl = c.royalties_earned - c.signing_bonus - c.dev_spend_total
          const wl = weeksLeft(c.end_date)
          const listeners = listenerMap.get(c.artist_id) ?? 0
          const estWeeklyIncome = computeWeeklyRoyalties(listeners, c.rev_split_label_pct, null)
          return (
            <div key={c.id} style={{ borderBottom: '1px solid var(--line-soft)', padding: '14px 16px' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 80px auto',
                gap: 12, alignItems: 'center',
              }}>
                <div>
                  <Link href={`/artist/${c.artists.spotify_id}`} style={{ color: 'var(--ink-hi)', textDecoration: 'none', fontSize: 14 }}>{c.artists.name}</Link>
                  <div style={{ marginTop: 3 }}>
                    <span className="tag" style={{ color: tc, fontSize: 9, border: `1px solid ${tc}`, padding: '1px 5px', background: `${tc}18` }}>{c.artists.tier.toUpperCase()}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginLeft: 8 }}>{fmtDate(c.start_date)} - {fmtDate(c.end_date)}</span>
                  </div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNED</div>
                  <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11, marginTop: 2 }}>{fmtUSD(c.signing_bonus)}</div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROYALTIES</div>
                  <div className="tag" style={{ color: 'var(--lime)', fontSize: 11, marginTop: 2 }}>{fmtUSD(c.royalties_earned)}</div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>NET P&L</div>
                  <div className="tag" style={{ color: netPnl >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 11, marginTop: 2 }}>{netPnl >= 0 ? '+' : ''}{fmtUSD(netPnl)}</div>
                </div>
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SPLIT / WKS</div>
                  <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11, marginTop: 2 }}>{c.rev_split_label_pct}% / {wl}w</div>
                </div>
                <DropButton contractId={c.id} artistName={c.artists.name} />
              </div>
              <DevAllocPanel
                contractId={c.id}
                alloc={allocMap.get(c.id) ?? null}
                estWeeklyIncome={estWeeklyIncome}
                activeRelease={releaseMap.get(c.id) ?? null}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
