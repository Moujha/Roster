import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Label, Contract, LabelEvent, Scout, DevAllocation, ReleaseAmplification } from '@/lib/types'
import type { LeaderboardRow } from '../leaderboard/client'
import { computeWeeklyRoyalties } from '@/lib/royalty'
import { describeEvent, relativeTime } from '@/lib/activity-helpers'
import CountrySetup from './country-setup'

type ContractRow = Contract & { artists: { name: string; tier: string; spotify_id: string } }
type ScoutRow = Scout & { artists: { name: string; tier: string; spotify_id: string } }

type DiscoveryRow = {
  artist_id: string
  stream_velocity_7d: number | null
  monthly_listeners: number | null
  momentum_score: number | null
  artists: { id: string; name: string; tier: string; genre: string | null; country: string | null; spotify_id: string }
}

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)', major: 'var(--rose)',
}

const EVENT_COLORS: Record<string, string> = {
  royalty_paid: 'var(--lime)', artist_signed: 'var(--cyan)',
  contract_expired: 'var(--rose)', tier_up: 'var(--amber)',
  scout_completed: 'var(--amber)', release_boost: 'var(--violet)',
}

function fmtUSD(n: number) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}
function fmtListeners(n: number | null) {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}
function weeksLeft(endDate: string) {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / (7 * 86_400_000)))
}
function daysLeft(dateStr: string) {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000))
}
function scoutProgress(startedAt: string, completesAt: string) {
  const start = new Date(startedAt + 'T00:00:00Z').getTime()
  const end = new Date(completesAt + 'T00:00:00Z').getTime()
  const now = Date.now()
  return Math.min(1, Math.max(0, (now - start) / (end - start)))
}

function repTier(rep: number) {
  if (rep < 250) return { label: 'NEW LABEL',   color: 'var(--ink-mid)',  next: 250 }
  if (rep < 600) return { label: 'ESTABLISHED', color: 'var(--cyan)',     next: 600 }
  return              { label: 'VETERAN',       color: 'var(--amber)',    next: 1000 }
}

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // ── Pass 1: core data ────────────────────────────────────────────────────────
  const [labelRes, contractsRes, eventsRes, scoutsRes, latestDateRes] = await Promise.all([
    supabase.from('labels').select('*').eq('id', user.id).single(),
    supabase.from('contracts').select('*, artists(name, tier, spotify_id)').eq('label_id', user.id).order('created_at', { ascending: false }),
    supabase.from('label_events').select('*').eq('label_id', user.id).order('created_at', { ascending: false }).limit(8),
    supabase.from('scouts').select('*, artists(name, tier, spotify_id)').eq('label_id', user.id).order('completes_at', { ascending: true }).limit(12),
    supabase.from('artist_stats_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
  ])

  const label = labelRes.data as Label
  const contracts = (contractsRes.data ?? []) as ContractRow[]
  const events = (eventsRes.data ?? []) as LabelEvent[]
  const scouts = (scoutsRes.data ?? []) as ScoutRow[]
  const latestDate = latestDateRes.data?.date ?? null

  const active = contracts.filter(c => c.status === 'active')
  const expired = contracts.filter(c => c.status === 'expired')
  const activeIds = active.map(c => c.id)
  const activeArtistIds = active.map(c => c.artist_id)
  const today = new Date().toISOString().slice(0, 10)

  // ── Pass 2: dev state + discovery + leaderboard ─────────────────────────────
  const [allocsRes, releaseAmpsRes, activeStatsRes, discoveryRes, leaderboardRes] = await Promise.all([
    activeIds.length
      ? supabase.from('dev_allocations').select('*').in('contract_id', activeIds)
      : Promise.resolve({ data: [] as DevAllocation[] }),
    activeIds.length
      ? supabase.from('release_amplifications').select('*').in('contract_id', activeIds).gte('expires_at', today)
      : Promise.resolve({ data: [] as ReleaseAmplification[] }),
    activeArtistIds.length && latestDate
      ? supabase.from('artist_stats_daily').select('artist_id, monthly_listeners').in('artist_id', activeArtistIds).eq('date', latestDate)
      : Promise.resolve({ data: [] as { artist_id: string; monthly_listeners: number | null }[] }),
    latestDate
      ? supabase.from('artist_stats_daily')
          .select('artist_id, stream_velocity_7d, monthly_listeners, momentum_score, artists!inner(id, name, tier, genre, country, spotify_id)')
          .eq('date', latestDate)
          .order('stream_velocity_7d', { ascending: false, nullsFirst: false })
          .limit(80)
      : Promise.resolve({ data: [] }),
    supabase.rpc('get_leaderboard'),
  ])

  const allocMap = new Map<string, DevAllocation>(
    ((allocsRes.data ?? []) as DevAllocation[]).map(a => [a.contract_id, a]),
  )
  const releaseMap = new Map<string, ReleaseAmplification>(
    ((releaseAmpsRes.data ?? []) as ReleaseAmplification[]).map(r => [r.contract_id, r]),
  )
  const listenerMap = new Map<string, number>(
    ((activeStatsRes.data ?? []) as { artist_id: string; monthly_listeners: number | null }[])
      .filter(r => r.monthly_listeners != null)
      .map(r => [r.artist_id, r.monthly_listeners!]),
  )

  const discoveryRows = (discoveryRes.data ?? []) as unknown as DiscoveryRow[]
  const signedArtistIds = new Set(activeArtistIds)

  const eligible = discoveryRows.filter(r => {
    const a = r.artists
    return a && a.tier !== 'major' && !signedArtistIds.has(r.artist_id)
  })

  const breaking = eligible.filter(r => (r.stream_velocity_7d ?? 0) > 0).slice(0, 5)
  const genreSet = new Set([label?.genre_1, label?.genre_2].filter(Boolean))
  const genrePicks = eligible
    .filter(r => genreSet.size > 0 && r.artists && genreSet.has(r.artists.genre))
    .sort((a, b) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0))
    .slice(0, 3)
  const regional = label?.country
    ? eligible
        .filter(r => r.artists && r.artists.country === label.country)
        .sort((a, b) => (b.stream_velocity_7d ?? 0) - (a.stream_velocity_7d ?? 0))
        .slice(0, 4)
    : []

  const weeklyIncomeEst = active.reduce((sum, c) => {
    const listeners = listenerMap.get(c.artist_id) ?? 0
    return sum + computeWeeklyRoyalties(listeners, c.rev_split_label_pct, null)
  }, 0)

  const activeScouts = scouts.filter(s => !s.completed_at)
  const completedScouts = scouts.filter(s => s.completed_at)

  const leaderboard = (leaderboardRes.data ?? []) as LeaderboardRow[]

  return {
    label, active, expired, events,
    activeScouts, completedScouts,
    allocMap, releaseMap, listenerMap,
    weeklyIncomeEst,
    breaking, genrePicks, regional,
    leaderboard,
    myLabelId: user.id,
  }
}

function ArtistCard({ row, label }: { row: DiscoveryRow; label: string }) {
  const a = row.artists
  const tc = TIER_COLORS[a.tier] ?? 'var(--ink-mid)'
  return (
    <Link href={`/artist/${a.spotify_id}`} style={{
      display: 'block', textDecoration: 'none', padding: '10px 12px',
      border: '1px solid var(--line)', background: 'var(--bg-panel)',
      minWidth: 150, flex: '0 0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: 'var(--ink-hi)', fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
        <span className="tag" style={{ color: tc, fontSize: 8, border: `1px solid ${tc}`, padding: '1px 4px', background: `${tc}14`, flexShrink: 0 }}>{a.tier.toUpperCase()}</span>
      </div>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>
        {fmtListeners(row.monthly_listeners)} listeners
      </div>
      {row.stream_velocity_7d != null && (
        <div className="tag" style={{ color: row.stream_velocity_7d >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 9, marginTop: 2 }}>
          {row.stream_velocity_7d >= 0 ? '↑' : '↓'} {Math.abs(row.stream_velocity_7d).toFixed(1)}% this week
        </div>
      )}
      {row.stream_velocity_7d == null && row.momentum_score != null && (
        <div className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9, marginTop: 2 }}>
          Score {row.momentum_score.toFixed(0)} / 100
        </div>
      )}
      {label !== 'breaking' && a.genre && (
        <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>{a.genre}</div>
      )}
    </Link>
  )
}

export default async function DashboardPage() {
  const data = await getData()
  if (!data) return null

  const {
    label, active, expired, events,
    activeScouts, completedScouts,
    allocMap, releaseMap, listenerMap,
    weeklyIncomeEst,
    breaking, genrePicks, regional,
    leaderboard, myLabelId,
  } = data

  const rep = repTier(label.reputation)
  const repBarPct = label.reputation === 0 ? 0 : Math.min(100, Math.round((label.reputation / rep.next) * 100))

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 1200 }}>

      {/* ── Week progress indicator ────────────────────────────────────────── */}
      {(() => {
        const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
        // getDay(): 0=Sun,1=Mon…6=Sat → convert to Mon=0…Sun=6
        const todayIdx = (new Date().getDay() + 6) % 7
        const isSunday = todayIdx === 6
        const isMonday = todayIdx === 0
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {days.map((d, i) => {
                const isPast    = i < todayIdx
                const isCurrent = i === todayIdx
                return (
                  <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 28, height: 4,
                      background: isCurrent ? 'var(--lime)' : isPast ? 'var(--ink-low)' : 'var(--bg-tile)',
                      opacity: isCurrent ? 1 : isPast ? 0.5 : 0.3,
                    }} />
                    <span className="tag" style={{
                      fontSize: 8,
                      color: isCurrent ? 'var(--lime)' : isPast ? 'var(--ink-low)' : 'var(--ink-low)',
                      opacity: isCurrent ? 1 : isPast ? 0.6 : 0.3,
                      fontWeight: isCurrent ? 700 : 400,
                    }}>{d}</span>
                  </div>
                )
              })}
            </div>
            {isMonday && (
              <span className="tag" style={{ color: 'var(--lime)', fontSize: 9, border: '1px solid rgba(200,255,58,0.4)', padding: '2px 8px', background: 'rgba(200,255,58,0.08)' }}>
                BUDGET UNLOCKED
              </span>
            )}
            {isSunday && (
              <span className="tag" style={{ color: 'var(--amber)', fontSize: 9, border: '1px solid rgba(255,176,32,0.4)', padding: '2px 8px', background: 'rgba(255,176,32,0.08)' }}>
                ROYALTIES CALCULATING…
              </span>
            )}
          </div>
        )
      })()}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
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

      {/* ── 4-stat row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {/* Treasury */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 14 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>TREASURY</div>
          <div className="display" style={{ fontSize: 36, color: 'var(--amber)', lineHeight: 1.1, marginTop: 4 }}>{fmtUSD(label.treasury)}</div>
        </div>
        {/* Weekly income */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 14 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>WEEKLY INCOME</div>
          {active.length === 0
            ? <div style={{ color: 'var(--ink-mid)', fontSize: 11, marginTop: 8 }}>Sign to start earning</div>
            : <div className="display" style={{ fontSize: 36, color: 'var(--lime)', lineHeight: 1.1, marginTop: 4 }}>{fmtUSD(weeklyIncomeEst)}</div>
          }
          {active.length > 0 && <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>EST. BEFORE DEV SPEND</div>}
        </div>
        {/* Reputation */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 14 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>REPUTATION</div>
          <div className="display" style={{ fontSize: 36, color: rep.color, lineHeight: 1.1, marginTop: 4 }}>{label.reputation}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 3, background: 'var(--line)', borderRadius: 2 }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${repBarPct}%`, background: rep.color }} />
            </div>
            <span className="tag" style={{ color: rep.color, fontSize: 8 }}>{rep.label}</span>
          </div>
        </div>
        {/* Roster */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 14 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROSTER</div>
          <div className="display" style={{ fontSize: 36, color: active.length >= 5 ? 'var(--rose)' : 'var(--cyan)', lineHeight: 1.1, marginTop: 4 }}>
            {active.length} <span style={{ fontSize: 20, opacity: 0.5 }}>/ 5</span>
          </div>
          <div className="tag" style={{ color: active.length >= 5 ? 'var(--rose)' : 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>
            {active.length >= 5 ? 'ROSTER FULL' : `${5 - active.length} SLOTS OPEN`}
          </div>
        </div>
      </div>

      {/* ── Expired contracts banner ────────────────────────────────────────── */}
      {expired.length > 0 && (
        <div style={{ background: 'rgba(255,84,120,0.06)', border: '2px solid var(--rose)', padding: '12px 16px', marginBottom: 14 }}>
          <div className="tag" style={{ color: 'var(--rose)', fontSize: 10, marginBottom: 8 }}>
            {expired.length} CONTRACT{expired.length > 1 ? 'S' : ''} EXPIRED — ACTION REQUIRED
          </div>
          {expired.map(c => (
            <div key={c.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0', borderTop: '1px solid rgba(255,84,120,0.15)',
            }}>
              <div>
                <span style={{ color: 'var(--ink-hi)', fontSize: 13 }}>{c.artists.name}</span>
                <span className="tag" style={{ color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 9, marginLeft: 8, border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 4px' }}>
                  {c.artists.tier.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={`/artist/${c.artists.spotify_id}`} style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '4px 10px', border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none' }}>RE-SIGN</Link>
                <Link href="/contracts" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '4px 10px', border: '1px solid var(--rose)', color: 'var(--rose)', textDecoration: 'none' }}>RELEASE</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main 2-column ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 14, alignItems: 'start', marginBottom: 16 }}>

        {/* Left: Active roster */}
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          <div style={{ padding: '8px 16px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>ACTIVE ROSTER</span>
            <Link href="/contracts" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--ink-low)', textDecoration: 'none' }}>MANAGE →</Link>
          </div>
          {active.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--ink-mid)', fontSize: 13, marginBottom: 16 }}>Your roster is empty</div>
              <Link href="/search" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px', border: '2px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none' }}>SIGN YOUR FIRST ARTIST</Link>
            </div>
          ) : active.map(c => {
            const wl = weeksLeft(c.end_date)
            const netPnl = c.royalties_earned - c.signing_bonus - c.dev_spend_total
            const alloc = allocMap.get(c.id)
            const release = releaseMap.get(c.id)
            return (
              <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px 60px auto', gap: 10, alignItems: 'center' }}>
                  <div>
                    <Link href={`/artist/${c.artists.spotify_id}`} style={{ color: 'var(--ink-hi)', textDecoration: 'none', fontSize: 14 }}>{c.artists.name}</Link>
                    <div style={{ marginTop: 2 }}>
                      <span className="tag" style={{ color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 9, border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 5px', background: `${TIER_COLORS[c.artists.tier] ?? 'transparent'}14` }}>
                        {c.artists.tier.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>WKS LEFT</div>
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
                  <Link href="/contracts" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '5px 10px', border: '1px solid var(--line)', color: 'var(--ink-mid)', textDecoration: 'none' }}>DEVELOP</Link>
                </div>
                {/* Dev status row */}
                {(alloc || release) && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {alloc?.playlist_tier && alloc.playlist_tier !== 'none' && (
                      <span className="tag" style={{ color: 'var(--cyan)', fontSize: 8, border: '1px solid var(--cyan)', padding: '1px 5px', background: 'rgba(0,200,220,0.07)' }}>
                        PL:{alloc.playlist_tier.toUpperCase()}
                      </span>
                    )}
                    {alloc?.social_push_tier && alloc.social_push_tier !== 'none' && (
                      <span className="tag" style={{ color: 'var(--lime)', fontSize: 8, border: '1px solid var(--lime)', padding: '1px 5px', background: 'rgba(130,230,80,0.07)' }}>
                        SP:{alloc.social_push_tier.toUpperCase()}
                      </span>
                    )}
                    {release && (
                      <span className="tag" style={{ color: 'var(--amber)', fontSize: 8, border: '1px solid var(--amber)', padding: '1px 5px', background: 'rgba(250,180,0,0.07)' }}>
                        BOOST {daysLeft(release.expires_at)}d
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Scouting */}
          <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
            <div style={{ padding: '8px 14px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tag" style={{ color: 'var(--amber)', fontSize: 10 }}>SCOUTING</span>
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{activeScouts.length} ACTIVE</span>
            </div>
            {completedScouts.map(s => (
              <Link key={s.id} href={`/artist/${s.artists.spotify_id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid var(--line-soft)', textDecoration: 'none' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-hi)' }}>{s.artists.name}</span>
                </div>
                <span className="tag" style={{ color: 'var(--amber)', fontSize: 8, border: '1px solid var(--amber)', padding: '1px 5px', background: 'rgba(250,180,0,0.1)', flexShrink: 0 }}>REPORT ▸</span>
              </Link>
            ))}
            {activeScouts.map(s => {
              const progress = scoutProgress(s.started_at, s.completes_at)
              const dl = daysLeft(s.completes_at)
              return (
                <div key={s.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-hi)' }}>{s.artists.name}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{dl}d</span>
                  </div>
                  <div style={{ height: 3, background: 'var(--line)', borderRadius: 2 }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${Math.round(progress * 100)}%`, background: 'var(--amber)' }} />
                  </div>
                </div>
              )
            })}
            {activeScouts.length === 0 && completedScouts.length === 0 && (
              <div style={{ padding: '12px 14px', color: 'var(--ink-mid)', fontSize: 12 }}>No active scouts</div>
            )}
            <div style={{ padding: '8px 14px' }}>
              <Link href="/search" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--ink-low)', textDecoration: 'none' }}>SCOUT AN ARTIST →</Link>
            </div>
          </div>

          {/* Activity */}
          <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
            <div style={{ padding: '8px 14px', borderBottom: '2px solid var(--line)' }}>
              <span className="tag" style={{ color: 'var(--lime)', fontSize: 10 }}>RECENT ACTIVITY</span>
            </div>
            {events.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--ink-mid)', fontSize: 12 }}>No activity yet</div>
            ) : events.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: EVENT_COLORS[e.event_type] ?? 'var(--ink-mid)', flexShrink: 0 }} />
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
              <Link href="/history" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--ink-low)', textDecoration: 'none' }}>VIEW ALL →</Link>
            </div>
          </div>

          {/* Leaderboard preview */}
          {leaderboard.length > 0 && (() => {
            const sorted = [...leaderboard].sort((a, b) => b.revenue_90d - a.revenue_90d)
            const myRank = sorted.findIndex(r => r.label_id === myLabelId) + 1
            const top5 = sorted.slice(0, 5)
            const myRow = sorted.find(r => r.label_id === myLabelId)
            const myInTop5 = myRank > 0 && myRank <= 5
            const RANK_SYMS = ['①', '②', '③', '④', '⑤']
            return (
              <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
                <div style={{ padding: '8px 14px', borderBottom: '2px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="tag" style={{ color: 'var(--amber)', fontSize: 10 }}>LEADERBOARD</span>
                  <Link href="/leaderboard" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, color: 'var(--ink-low)', textDecoration: 'none' }}>VIEW ALL →</Link>
                </div>
                {top5.map((row, idx) => {
                  const isMe = row.label_id === myLabelId
                  return (
                    <div key={row.label_id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 14px', borderBottom: '1px solid var(--line-soft)',
                      background: isMe ? 'rgba(200,255,58,0.04)' : 'transparent',
                      borderLeft: isMe ? '3px solid var(--lime)' : '3px solid transparent',
                    }}>
                      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 12, color: idx < 3 ? ['var(--amber)', 'var(--ink-mid)', 'var(--violet)'][idx] : 'var(--ink-low)', width: 16, flexShrink: 0 }}>
                        {RANK_SYMS[idx]}
                      </span>
                      <span style={{ flex: 1, fontSize: 11, color: isMe ? 'var(--lime)' : 'var(--ink-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.label_name}
                        {isMe && <span className="tag" style={{ color: 'var(--lime)', fontSize: 7, marginLeft: 5, border: '1px solid var(--lime)', padding: '0 3px' }}>YOU</span>}
                      </span>
                      <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9, flexShrink: 0 }}>{fmtUSD(row.revenue_90d)}</span>
                    </div>
                  )
                })}
                {!myInTop5 && myRow && (
                  <>
                    <div style={{ padding: '2px 14px', color: 'var(--ink-low)', fontSize: 10, textAlign: 'center' }}>···</div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 14px', borderBottom: '1px solid var(--line-soft)',
                      background: 'rgba(200,255,58,0.04)', borderLeft: '3px solid var(--lime)',
                    }}>
                      <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, width: 16, flexShrink: 0 }}>#{myRank}</span>
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--lime)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {myRow.label_name}
                        <span className="tag" style={{ color: 'var(--lime)', fontSize: 7, marginLeft: 5, border: '1px solid var(--lime)', padding: '0 3px' }}>YOU</span>
                      </span>
                      <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9, flexShrink: 0 }}>{fmtUSD(myRow.revenue_90d)}</span>
                    </div>
                  </>
                )}
              </div>
            )
          })()}

        </div>
      </div>

      {/* ── Country setup prompt ───────────────────────────────────────────── */}
      {!label.country && <CountrySetup />}

      {/* ── Discovery ──────────────────────────────────────────────────────── */}
      {(breaking.length > 0 || genrePicks.length > 0 || regional.length > 0) && (
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: '14px 16px' }}>
          <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10, marginBottom: 14 }}>DISCOVER</div>

          {breaking.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginBottom: 8 }}>BREAKING THIS WEEK</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {breaking.map(r => <ArtistCard key={r.artist_id} row={r} label="breaking" />)}
              </div>
            </div>
          )}

          {genrePicks.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="tag" style={{ color: 'var(--violet)', fontSize: 9, marginBottom: 8 }}>
                YOUR GENRES — {[label.genre_1, label.genre_2].filter(Boolean).join(' · ').toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {genrePicks.map(r => <ArtistCard key={r.artist_id} row={r} label="genre" />)}
              </div>
            </div>
          )}

          {regional.length > 0 && (
            <div>
              <div className="tag" style={{ color: 'var(--cyan)', fontSize: 9, marginBottom: 8 }}>
                TRENDING IN {label.country?.toUpperCase() ?? 'YOUR REGION'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {regional.map(r => <ArtistCard key={r.artist_id} row={r} label="regional" />)}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
