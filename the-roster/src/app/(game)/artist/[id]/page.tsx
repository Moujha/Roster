import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type ScoreBreakdown = { streams: number; social: number; charts: number; momentum: number }

async function getArtistDetail(id: string) {
  const supabase = await createClient()

  const [artistRes, statsRes, pricesRes] = await Promise.all([
    supabase.from('artists').select('id, name, spotify_id, image_url, genre').eq('id', id).single(),
    supabase.from('artist_stats')
      .select('score_total, score_breakdown, spotify_monthly_listeners, chart_position, date')
      .eq('artist_id', id)
      .order('date', { ascending: false })
      .limit(30),
    supabase.from('market_prices')
      .select('price, price_change_pct, date')
      .eq('artist_id', id)
      .order('date', { ascending: false })
      .limit(30),
  ])

  if (!artistRes.data) return null

  const latestStats = statsRes.data?.[0] ?? null
  const latestPrice = pricesRes.data?.[0] ?? null
  const priceHistory = [...(pricesRes.data ?? [])].reverse()
  const listenerHistory = [...(statsRes.data ?? [])].reverse()

  return { artist: artistRes.data, latestStats, latestPrice, priceHistory, listenerHistory }
}

function fmtPrice(p: number) {
  if (p >= 1_000_000) return `$${(p / 1_000_000).toFixed(2)}M`
  if (p >= 1_000) return `$${(p / 1_000).toFixed(0)}K`
  return p === 0 ? '—' : `$${p}`
}
function fmtM(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n > 0 ? String(n) : '—'
}

const AVATAR_COLORS = ['#7c3aed','#db2777','#059669','#d97706','#2563eb','#dc2626','#0891b2','#65a30d']
function avatarBg(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

const TIER_COLORS: Record<string, string> = { Hot: 'var(--magenta)', Rising: 'var(--lime)', Steady: 'var(--cyan)', Rookie: 'var(--amber)' }
function tierFromScore(score: number) {
  if (score >= 70) return 'Hot'
  if (score >= 55) return 'Rising'
  if (score >= 40) return 'Steady'
  return 'Rookie'
}

function Sparkline({ data, color, height = 48 }: { data: number[]; color: string; height?: number }) {
  if (data.length === 0) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 280
  const barW = Math.floor((w - (data.length - 1)) / data.length)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height, gap: 1, color }}>
      {data.map((v, i) => {
        const pct = (v - min) / range
        const barH = Math.max(2, Math.round(pct * (height - 4)) + 4)
        const isLast = i === data.length - 1
        return (
          <div key={i} style={{
            flex: 1, height: barH, minWidth: 2,
            background: isLast ? color : `${color}88`,
          }} />
        )
      })}
    </div>
  )
}

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value / max))
  const blocks = 20
  const filled = Math.round(pct * blocks)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{label}</span>
        <span className="tag" style={{ color, fontSize: 9 }}>
          {value > 0 ? '+' : ''}{value.toFixed(1)} / {max}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 1, height: 6 }}>
        {Array.from({ length: blocks }).map((_, i) => (
          <div key={i} style={{ flex: 1, background: i < filled ? color : 'var(--bg-tile)' }} />
        ))}
      </div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-tile)', border: '2px solid var(--line)', padding: '10px 14px' }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{label}</div>
      <div className="display" style={{ color, fontSize: 24, lineHeight: 0.9, marginTop: 4 }}>{value}</div>
    </div>
  )
}

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getArtistDetail(id)
  if (!data) notFound()

  const { artist, latestStats, latestPrice, priceHistory, listenerHistory } = data

  const score = latestStats?.score_total ?? 0
  const tier = tierFromScore(score)
  const tc = TIER_COLORS[tier]
  const breakdown: ScoreBreakdown = (latestStats?.score_breakdown as ScoreBreakdown) ?? { streams: 0, social: 0, charts: 0, momentum: 0 }
  const listeners = latestStats?.spotify_monthly_listeners ?? 0
  const chartPos = latestStats?.chart_position ?? null
  const price = latestPrice?.price ?? 0
  const changePct = latestPrice?.price_change_pct ?? null
  const up = changePct !== null && changePct >= 0
  const initials = artist.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const prices = priceHistory.map(p => p.price)
  const listeners7 = listenerHistory.map(p => p.spotify_monthly_listeners ?? 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: "'Pixelify Sans', monospace" }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: '2px solid var(--line)', background: 'var(--bg-panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/market" style={{ textDecoration: 'none' }}>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, cursor: 'pointer' }}>← MARKET</span>
          </Link>
          <span className="tag" style={{ color: 'var(--ink-mid)' }}>·</span>
          <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11 }}>ARTIST FILE</span>
        </div>
        <span style={{ background: tc, color: '#100719', padding: '3px 8px', fontFamily: 'Silkscreen, monospace', fontSize: 9, letterSpacing: '1px', textTransform: 'uppercase' }}>{tier}</span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Hero */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16 }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {artist.image_url ? (
              <img src={artist.image_url} alt={artist.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', imageRendering: 'pixelated' }} />
            ) : (
              <div style={{ width: '100%', aspectRatio: '1', background: avatarBg(artist.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Silkscreen, monospace', fontSize: 48 }}>
                {initials}
              </div>
            )}
          </div>

          {/* Identity + price */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="display" style={{ fontSize: 52, color: 'var(--ink-hi)', lineHeight: 0.85 }}>{artist.name}</div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 10, marginTop: 6 }}>{(artist.genre ?? '—').toUpperCase()}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 16 }}>
              <span className="display" style={{ fontSize: 48, color: tc, lineHeight: 0.85, textShadow: '0 4px 0 rgba(0,0,0,0.5)' }}>{fmtPrice(price)}</span>
              {changePct !== null ? (
                <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 13, color: up ? 'var(--lime)' : 'var(--rose)' }}>
                  {up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
                </span>
              ) : (
                <span className="tag" style={{ color: 'var(--ink-low)' }}>FIRST DATA</span>
              )}
            </div>

            {/* Score total bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>PRESTIGE SCORE</span>
                <span className="tag" style={{ color: tc, fontSize: 11 }}>{score}/100</span>
              </div>
              <div style={{ display: 'flex', gap: 1, height: 8 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, background: i < Math.round(score / 10) ? tc : 'var(--bg-tile)' }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <StatBox label="MONTHLY LISTENERS" value={fmtM(listeners)} color="var(--cyan)" />
          <StatBox label="MARKET VALUE" value={fmtPrice(price)} color={tc} />
          <StatBox label="CHART POSITION" value={chartPos !== null ? `#${chartPos}` : '—'} color="var(--amber)" />
        </div>

        {/* Score breakdown */}
        <div style={{ background: 'var(--bg-panel)', boxShadow: '0 0 0 2px var(--line), inset 0 0 0 1px #000' }}>
          <div style={{
            padding: '6px 12px',
            background: 'linear-gradient(180deg, var(--bg-elev) 0%, var(--bg-elev) 50%, var(--bg-tile) 50%, var(--bg-tile) 100%)',
            borderBottom: '2px solid var(--line)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ width: 8, height: 8, background: tc, display: 'inline-block' }} />
            <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>SCORE BREAKDOWN</span>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>MAX 100 PTS</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <ScoreBar label="STREAMS · MONTHLY LISTENERS" value={breakdown.streams} max={50} color="var(--cyan)" />
            <ScoreBar label="SOCIAL · FOLLOWERS" value={breakdown.social} max={25} color="var(--violet)" />
            <ScoreBar label="CHARTS · GLOBAL RANK" value={breakdown.charts} max={25} color="var(--amber)" />
            <div style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>MOMENTUM · WoW CHANGE</span>
                <span className="tag" style={{ color: breakdown.momentum >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 9 }}>
                  {breakdown.momentum > 0 ? '+' : ''}{breakdown.momentum.toFixed(2)} / ±5
                </span>
              </div>
              <div style={{ display: 'flex', gap: 1, height: 6 }}>
                {Array.from({ length: 10 }).map((_, i) => {
                  const center = 5
                  const val = (breakdown.momentum + 5) / 10
                  const filled = Math.round(val * 10)
                  const isPositive = i >= center && i < filled
                  const isNegative = i < center && i >= filled
                  return (
                    <div key={i} style={{
                      flex: 1,
                      background: i === center - 1 || i === center ? 'var(--line)' :
                        isPositive ? 'var(--lime)' :
                        isNegative ? 'var(--rose)' :
                        'var(--bg-tile)',
                    }} />
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

          {/* Price history */}
          <div style={{ background: 'var(--bg-panel)', boxShadow: '0 0 0 2px var(--line), inset 0 0 0 1px #000' }}>
            <div style={{
              padding: '6px 12px',
              background: 'linear-gradient(180deg, var(--bg-elev) 0%, var(--bg-elev) 50%, var(--bg-tile) 50%, var(--bg-tile) 100%)',
              borderBottom: '2px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, background: tc, display: 'inline-block' }} />
                <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>PRICE HISTORY</span>
              </div>
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{prices.length}D</span>
            </div>
            <div style={{ padding: 14 }}>
              {prices.length > 1 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{fmtPrice(Math.min(...prices))}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{fmtPrice(Math.max(...prices))}</span>
                  </div>
                  <Sparkline data={prices} color={tc} height={60} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>
                      {priceHistory[0]?.date ? new Date(priceHistory[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>TODAY</span>
                  </div>
                </>
              ) : (
                <div className="tag" style={{ color: 'var(--ink-low)', textAlign: 'center', padding: '20px 0' }}>NOT ENOUGH DATA</div>
              )}
            </div>
          </div>

          {/* Listener history */}
          <div style={{ background: 'var(--bg-panel)', boxShadow: '0 0 0 2px var(--line), inset 0 0 0 1px #000' }}>
            <div style={{
              padding: '6px 12px',
              background: 'linear-gradient(180deg, var(--bg-elev) 0%, var(--bg-elev) 50%, var(--bg-tile) 50%, var(--bg-tile) 100%)',
              borderBottom: '2px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, background: 'var(--cyan)', display: 'inline-block' }} />
                <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>MONTHLY LISTENERS</span>
              </div>
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{listeners7.length}D</span>
            </div>
            <div style={{ padding: 14 }}>
              {listeners7.length > 1 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{fmtM(Math.min(...listeners7))}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{fmtM(Math.max(...listeners7))}</span>
                  </div>
                  <Sparkline data={listeners7} color="var(--cyan)" height={60} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>
                      {listenerHistory[0]?.date ? new Date(listenerHistory[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>TODAY</span>
                  </div>
                </>
              ) : (
                <div className="tag" style={{ color: 'var(--ink-low)', textAlign: 'center', padding: '20px 0' }}>NOT ENOUGH DATA</div>
              )}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/market" style={{ textDecoration: 'none', flex: 1 }}>
            <button style={{
              width: '100%', fontFamily: 'Silkscreen, monospace', fontSize: 10,
              background: 'var(--bg-elev)', color: 'var(--ink-mid)',
              border: 'none', padding: '12px', cursor: 'pointer',
              boxShadow: '0 -2px 0 0 rgba(255,255,255,0.1) inset, 0 2px 0 0 rgba(0,0,0,0.6) inset, 0 3px 0 0 #000',
              textTransform: 'uppercase', letterSpacing: '1.5px',
            }}>← BACK TO MARKET</button>
          </Link>
          <button style={{
            flex: 2, fontFamily: 'Silkscreen, monospace', fontSize: 11,
            background: tc, color: '#100719',
            border: 'none', padding: '12px', cursor: 'not-allowed', opacity: 0.5,
            boxShadow: `0 -2px 0 0 rgba(255,255,255,0.25) inset, 0 2px 0 0 rgba(0,0,0,0.6) inset, 0 3px 0 0 #000`,
            textTransform: 'uppercase', letterSpacing: '1.5px',
          }}>SIGN ARTIST · COMING SOON</button>
        </div>

      </div>
    </div>
  )
}
