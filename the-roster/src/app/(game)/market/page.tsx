import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

type MarketArtist = {
  id: string; name: string; spotify_id: string
  image_url: string | null; genre: string | null
  price: number; price_change_pct: number | null
  score: number; monthly_listeners: number
}

async function getMarket(): Promise<MarketArtist[]> {
  const supabase = await createClient()
  const [artistsRes, pricesRes, statsRes] = await Promise.all([
    supabase.from('artists').select('id, name, spotify_id, image_url, genre'),
    supabase.from('market_prices')
      .select('artist_id, price, price_change_pct, date')
      .order('date', { ascending: false })
      .limit(200),
    supabase.from('artist_stats')
      .select('artist_id, score_total, spotify_monthly_listeners, date')
      .order('date', { ascending: false })
      .limit(200),
  ])
  // Keep only the latest row per artist
  const priceMap = new Map<string, typeof pricesRes.data[0]>()
  for (const p of pricesRes.data ?? []) {
    if (!priceMap.has(p.artist_id)) priceMap.set(p.artist_id, p)
  }
  const statsMap = new Map<string, typeof statsRes.data[0]>()
  for (const s of statsRes.data ?? []) {
    if (!statsMap.has(s.artist_id)) statsMap.set(s.artist_id, s)
  }
  return (artistsRes.data ?? [])
    .map(a => ({
      ...a,
      price: priceMap.get(a.id)?.price ?? 0,
      price_change_pct: priceMap.get(a.id)?.price_change_pct ?? null,
      score: statsMap.get(a.id)?.score_total ?? 0,
      monthly_listeners: statsMap.get(a.id)?.spotify_monthly_listeners ?? 0,
    }))
    .sort((a, b) => b.price - a.price)
}

function fmtPrice(p: number) {
  if (p >= 1_000_000) return `$${(p / 1_000_000).toFixed(1)}M`
  if (p >= 1_000) return `$${(p / 1_000).toFixed(0)}K`
  return p === 0 ? '—' : `$${p}`
}
function fmtM(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
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

export default async function MarketPage() {
  const artists = await getMarket()
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: "'Pixelify Sans', monospace" }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: '2px solid var(--line)', background: 'var(--bg-panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROSTER</span>
          <span className="tag" style={{ color: 'var(--ink-mid)' }}>·</span>
          <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11 }}>MARKET · {today.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{artists.length} ARTISTS</span>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: 12 }}>
        {artists.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--ink-low)' }}>
            <div className="display" style={{ fontSize: 32 }}>NO DATA YET</div>
            <div className="tag" style={{ marginTop: 8 }}>RUN THE PIPELINE TO POPULATE SCORES AND PRICES</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {artists.map((a, rank) => {
              const tier = tierFromScore(a.score)
              const tc = TIER_COLORS[tier]
              const up = a.price_change_pct !== null && a.price_change_pct >= 0
              const initials = a.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
              return (
                <div key={a.id} style={{
                  background: 'var(--bg-panel)',
                  boxShadow: '0 0 0 2px var(--line), inset 0 0 0 1px #000',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.1s',
                }}>
                  {/* Card header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: 'linear-gradient(180deg, var(--bg-elev) 0%, var(--bg-elev) 50%, var(--bg-tile) 50%, var(--bg-tile) 100%)',
                    borderBottom: '2px solid var(--line)',
                  }}>
                    <span style={{ background: tc, color: '#100719', padding: '2px 6px', fontFamily: 'Silkscreen, monospace', fontSize: 8, letterSpacing: '1px', textTransform: 'uppercase' }}>{tier}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>#{rank + 1}</span>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '10px 12px' }}>
                    {/* Artist identity */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                      {a.image_url ? (
                        <img src={a.image_url} alt={a.name} style={{ width: 44, height: 44, objectFit: 'cover', flexShrink: 0 }}/>
                      ) : (
                        <div style={{ width: 44, height: 44, background: avatarBg(a.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'Silkscreen, monospace', flexShrink: 0 }}>{initials}</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="display" style={{ fontSize: 20, color: 'var(--ink-hi)', lineHeight: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 3 }}>{(a.genre ?? '—').toUpperCase().slice(0, 16)}</div>
                      </div>
                    </div>

                    {/* Price */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="display" style={{ fontSize: 26, color: 'var(--ink-hi)', lineHeight: 0.85, textShadow: '0 2px 0 #000' }}>
                        {fmtPrice(a.price)}
                      </span>
                      {a.price_change_pct !== null ? (
                        <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 10, color: up ? 'var(--lime)' : 'var(--rose)' }}>
                          {up ? '▲' : '▼'} {Math.abs(a.price_change_pct).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="tag" style={{ color: 'var(--ink-low)' }}>FIRST RUN</span>
                      )}
                    </div>

                    {/* Score bar */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="tag" style={{ color: 'var(--ink-low)' }}>PRESTIGE SCORE</span>
                        <span className="tag" style={{ color: tc }}>{a.score}/100</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-deep)', display: 'flex', gap: 1 }}>
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} style={{ flex: 1, background: i < Math.round(a.score / 10) ? tc : 'var(--bg-tile)' }} />
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>
                        {fmtM(a.monthly_listeners)} LISTENERS
                      </span>
                      <button style={{
                        fontFamily: 'Silkscreen, monospace', fontSize: 9,
                        background: 'var(--bg-elev)', color: tc,
                        border: 'none', padding: '5px 10px', cursor: 'not-allowed',
                        boxShadow: `0 -2px 0 0 ${tc}33 inset, 0 2px 0 0 rgba(0,0,0,0.6) inset, 0 3px 0 0 #000`,
                        textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.5,
                      }}>SIGN</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
