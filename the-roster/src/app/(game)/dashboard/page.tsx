import { createClient } from '@/lib/supabase/server'

// ── Data ──────────────────────────────────────────────────────────────────────

type ArtistRow = {
  id: string; name: string; spotify_id: string; image_url: string | null; genre: string | null
  score: number; monthly_listeners: number; price: number; price_change_pct: number | null
}

async function getDashboardData() {
  const supabase = await createClient()

  const [artistsRes, statsRes, pricesRes] = await Promise.all([
    supabase.from('artists').select('id, name, spotify_id, image_url, genre'),
    supabase.from('artist_stats')
      .select('artist_id, score_total, spotify_monthly_listeners, date')
      .order('date', { ascending: false })
      .limit(200),
    supabase.from('market_prices')
      .select('artist_id, price, price_change_pct, date')
      .order('date', { ascending: false })
      .limit(200),
  ])

  // Keep only the latest row per artist
  const statsMap = new Map<string, typeof statsRes.data[0]>()
  for (const s of statsRes.data ?? []) {
    if (!statsMap.has(s.artist_id)) statsMap.set(s.artist_id, s)
  }
  const priceMap = new Map<string, typeof pricesRes.data[0]>()
  for (const p of pricesRes.data ?? []) {
    if (!priceMap.has(p.artist_id)) priceMap.set(p.artist_id, p)
  }

  const artists: ArtistRow[] = (artistsRes.data ?? []).map(a => ({
    ...a,
    score: statsMap.get(a.id)?.score_total ?? 0,
    monthly_listeners: statsMap.get(a.id)?.spotify_monthly_listeners ?? 0,
    price: priceMap.get(a.id)?.price ?? 0,
    price_change_pct: priceMap.get(a.id)?.price_change_pct ?? null,
  })).sort((a, b) => b.score - a.score)

  const totalListeners = artists.reduce((s, a) => s + a.monthly_listeners, 0)
  const totalScore = artists.reduce((s, a) => s + a.score, 0)

  return { artists, totalListeners, totalScore }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spark({ data, color, height = 28, barW = 3, gap = 1 }: {
  data: number[]; color: string; height?: number; barW?: number; gap?: number
}) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height, gap, color }}>
      {data.map((v, i) => (
        <i key={i} style={{ display: 'block', width: barW, height: `${(v / max) * 100}%`, background: 'currentColor' }} />
      ))}
    </div>
  )
}

function DeltaChip({ value }: { value: number }) {
  const up = value >= 0
  const c = up ? 'var(--lime)' : 'var(--rose)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: c, fontFamily: 'Silkscreen, monospace', fontSize: 11 }}>
      <svg width="8" height="8" viewBox="0 0 8 8" shapeRendering="crispEdges">
        {up ? (
          <g fill={c}>
            <rect x="3" y="0" width="2" height="2"/><rect x="2" y="2" width="4" height="2"/><rect x="1" y="4" width="6" height="2"/>
          </g>
        ) : (
          <g fill={c}>
            <rect x="1" y="2" width="6" height="2"/><rect x="2" y="4" width="4" height="2"/><rect x="3" y="6" width="2" height="2"/>
          </g>
        )}
      </svg>
      {up ? '+' : ''}{value}
    </span>
  )
}

function Panel({ title, kicker, color = 'var(--lime)', children, style = {}, action }: {
  title: string; kicker?: string; color?: string; children: React.ReactNode; style?: React.CSSProperties; action?: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--bg-panel)',
      boxShadow: '0 0 0 2px var(--line), inset 0 0 0 1px #000',
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px',
        background: 'linear-gradient(180deg, var(--bg-elev) 0%, var(--bg-elev) 50%, var(--bg-tile) 50%, var(--bg-tile) 100%)',
        borderBottom: '2px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, background: color, display: 'inline-block' }} />
          <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>{title}</span>
          {kicker && <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{kicker}</span>}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

function MetricTile({ label, value, unit, delta, color, spark }: {
  label: string; value: string; unit: string; delta: string; color: string; spark: number[]
}) {
  return (
    <div style={{
      background: 'var(--bg-tile)', border: '2px solid var(--line)',
      padding: '10px 12px', position: 'relative', minHeight: 96,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>{label}</span>
        <span style={{ width: 6, height: 6, background: color, display: 'block' }} />
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="display" style={{ fontSize: 28, fontWeight: 400, color, lineHeight: 0.85, textShadow: '0 4px 0 rgba(0,0,0,0.5)' }}>{value}</span>
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{unit}</span>
      </div>
      <div style={{ marginTop: 4 }}><DeltaChip value={parseFloat(delta)}/></div>
      <div style={{ position: 'absolute', right: 6, bottom: 6, width: 60, height: 18 }}>
        <Spark data={spark} color={color} barW={3} gap={1} height={18} />
      </div>
    </div>
  )
}

const AVATAR_COLORS = ['#7c3aed','#db2777','#059669','#d97706','#2563eb','#dc2626','#0891b2','#65a30d']
function avatarBg(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function fmtM(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

const TIER_COLORS: Record<string, string> = { Hot: 'var(--magenta)', Rising: 'var(--lime)', Steady: 'var(--cyan)', Rookie: 'var(--amber)' }
function tierFromScore(score: number) {
  if (score >= 70) return 'Hot'
  if (score >= 55) return 'Rising'
  if (score >= 40) return 'Steady'
  return 'Rookie'
}

// Mock game data
const MOCK_LEAGUE = [
  { rank: 1, label: 'WAVELENGTH', user: 'jules',  prestige: 18420, delta: +812, you: false, emoji: '◆' },
  { rank: 2, label: 'THE ROSTER', user: 'you',    prestige: 17890, delta: +717, you: true,  emoji: '★' },
  { rank: 3, label: 'NIGHTSHIFT', user: 'mara',   prestige: 16110, delta: +402, you: false, emoji: '▲' },
  { rank: 4, label: 'GOLD TEETH', user: 'arif',   prestige: 14530, delta: +280, you: false, emoji: '●' },
  { rank: 5, label: 'COPYCAT FM', user: 'len',    prestige: 13980, delta: -120, you: false, emoji: '✦' },
]
const MOCK_OBJECTIVES = [
  { label: 'SCOUT IN 3 REGIONS',            done: true  },
  { label: 'BEAT A FRIEND BY 500 PTS',      done: true  },
  { label: 'GROW 1 ARTIST +200 PRESTIGE',   done: false },
  { label: 'RELEASE A CAMPAIGN',            done: false },
]
const MOCK_FEED = [
  { t: '07:12', icon: 'SP', color: 'var(--cyan)',    label: 'PIPELINE', text: 'Daily scrape completed — 22 artists updated' },
  { t: '06:48', icon: '★',  color: 'var(--lime)',    label: 'PRESTIGE', text: 'Daily payout +717 — 2nd in league' },
  { t: '06:30', icon: '▲',  color: 'var(--magenta)', label: 'MARKET',   text: 'Justin Bieber leads at $14.2M market cap' },
  { t: 'YDA',   icon: '✓',  color: 'var(--lime)',    label: 'SYSTEM',   text: 'Week 01 started — collect your artists!' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { artists, totalListeners, totalScore } = await getDashboardData()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()

  const topArtist = artists[0]
  const sparkBase = [8,9,10,9,11,12,14,13,15,16,17,18,19,21,22,24,23,25,26,28]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace" }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: '2px solid var(--line)', background: 'var(--bg-panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>LABEL HQ</span>
          <span className="tag" style={{ color: 'var(--ink-mid)' }}>·</span>
          <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11 }}>DAILY REPORT — {today}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>WALLET</span>
            <span className="tag" style={{ color: 'var(--amber)', fontSize: 12 }}>§ 24,810</span>
          </div>
          <div style={{ width: 2, height: 16, background: 'var(--line)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>WEEK CLOSES IN</span>
            <span className="tag" style={{ color: 'var(--lime)', fontSize: 12 }}>2D 14H 22M</span>
          </div>
          <button style={{
            fontFamily: 'Silkscreen, monospace', background: 'var(--lime)', color: '#100719',
            border: 'none', padding: '8px 12px', cursor: 'pointer',
            boxShadow: '0 -2px 0 0 rgba(255,255,255,0.25) inset, 0 2px 0 0 rgba(0,0,0,0.6) inset, 0 3px 0 0 #000',
            textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: 10,
          }}>END DAY</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 12, padding: 12, flex: 1 }}>

        {/* Center column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

          {/* Hero + metric tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 1fr 1fr 1fr', gap: 12 }}>
            {/* Prestige hero */}
            <div style={{
              background: 'var(--bg-panel)',
              boxShadow: '0 0 0 2px var(--lime), inset 0 0 0 1px #000',
              padding: 14, position: 'relative', overflow: 'hidden',
            }}>
              <div className="tag" style={{ color: 'var(--lime)', fontSize: 9 }}>TOTAL PRESTIGE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span className="display" style={{ fontSize: 52, color: 'var(--lime)', lineHeight: 0.85, textShadow: '0 4px 0 rgba(0,0,0,0.5)' }}>
                  {totalScore.toLocaleString()}
                </span>
                <span className="tag" style={{ color: 'var(--ink-low)' }}>PTS</span>
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <DeltaChip value={artists.length} />
                <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>ARTISTS ON ROSTER</span>
              </div>
              <div style={{ marginTop: 14, height: 44 }}>
                <Spark data={sparkBase} color="var(--lime)" barW={6} gap={2} height={44} />
              </div>
              {/* Pixel corner deco */}
              <svg width="40" height="40" viewBox="0 0 10 10" shapeRendering="crispEdges" style={{ position: 'absolute', top: 6, right: 6 }}>
                <rect x="0" y="0" width="2" height="2" fill="var(--lime)"/>
                <rect x="3" y="0" width="2" height="2" fill="var(--lime)"/>
                <rect x="6" y="0" width="2" height="2" fill="var(--lime)"/>
                <rect x="0" y="3" width="2" height="2" fill="var(--lime)"/>
              </svg>
            </div>
            <MetricTile label="SPOTIFY MTHLY" value={fmtM(totalListeners)} unit="LISTENERS" delta="+0.54M" color="var(--cyan)" spark={[10,11,12,11,13,14,15,14,16,17,18]}/>
            <MetricTile label="TIKTOK VIEWS"  value="29.6M"  unit="·24H"    delta="+2.39M" color="var(--magenta)" spark={[6,7,8,9,8,10,12,14,15,14,17]}/>
            <MetricTile label="YT SUBS"       value="11.04M" unit="TOTAL"   delta="+82K"   color="var(--amber)"  spark={[10,10,11,11,12,11,12,12,13,13,14]}/>
            <MetricTile label="IG FOLLOWERS"  value="10.27M" unit="TOTAL"   delta="+34K"   color="var(--violet)" spark={[12,12,12,13,13,13,14,14,14,15,15]}/>
          </div>

          {/* Feed */}
          <Panel title="LIVE FEED" kicker="24H ACTIVITY" color="var(--magenta)" action={<span className="tag" style={{ color: 'var(--magenta)', fontSize: 9 }}>● LIVE</span>}>
            {MOCK_FEED.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '38px 20px 1fr', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line-soft)', alignItems: 'start' }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, paddingTop: 2 }}>{f.t}</span>
                <span style={{ width: 20, height: 20, background: f.color, color: '#100719', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Silkscreen, monospace', fontSize: 9, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div className="tag" style={{ color: f.color, fontSize: 9 }}>{f.label}</div>
                  <div style={{ color: 'var(--ink)', fontSize: 12, marginTop: 2, fontFamily: "'Pixelify Sans', monospace" }}>{f.text}</div>
                </div>
              </div>
            ))}
          </Panel>

          {/* Roster strip */}
          <Panel title="ACTIVE ROSTER" kicker={`${artists.length} ARTISTS`} color="var(--lime)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, padding: 10 }}>
              {artists.slice(0, 6).map(a => {
                const tier = tierFromScore(a.score)
                const tc = TIER_COLORS[tier]
                const initials = a.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div key={a.id} style={{ background: 'var(--bg-tile)', border: '2px solid var(--line)', padding: 8, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {a.image_url ? (
                        <img src={a.image_url} alt={a.name} style={{ width: 40, height: 40, objectFit: 'cover', imageRendering: 'pixelated' }}/>
                      ) : (
                        <div style={{ width: 40, height: 40, background: avatarBg(a.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'Silkscreen, monospace', flexShrink: 0 }}>{initials}</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="display" style={{ color: 'var(--ink-hi)', fontSize: 16, lineHeight: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>{(a.genre ?? '—').toUpperCase().slice(0, 12)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span className="tag" style={{ color: tc, fontSize: 11 }}>★{a.score}</span>
                      <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>{fmtM(a.monthly_listeners)}</span>
                    </div>
                    {/* Momentum bar */}
                    <div style={{ marginTop: 6, height: 4, background: 'var(--bg-deep)', display: 'flex', gap: 1 }}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} style={{ flex: 1, background: i < Math.round((a.score / 100) * 10) ? tc : 'transparent' }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span className="tag" style={{ fontSize: 8, color: 'var(--ink-low)' }}>SCORE</span>
                      <span style={{ background: tc, color: '#100719', padding: '2px 6px', fontFamily: 'Silkscreen, monospace', fontSize: 8, letterSpacing: '1px', textTransform: 'uppercase' }}>{tier}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Panel title="FRIENDS LEAGUE" kicker="WEEK 01 · 5 LABELS" color="var(--amber)">
            {MOCK_LEAGUE.map(l => (
              <div key={l.rank} style={{
                display: 'grid', gridTemplateColumns: '24px 24px 1fr auto auto',
                alignItems: 'center', gap: 10, padding: '8px 12px',
                background: l.you ? 'rgba(200,255,58,0.06)' : 'transparent',
                borderBottom: '1px solid var(--line-soft)',
              }}>
                <span className="tag" style={{ color: l.rank <= 3 ? 'var(--lime)' : 'var(--ink-low)', fontSize: 12 }}>{String(l.rank).padStart(2, '0')}</span>
                <span style={{ color: l.you ? 'var(--lime)' : 'var(--ink-mid)', fontSize: 14 }}>{l.emoji}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="tag" style={{ color: l.you ? 'var(--lime)' : 'var(--ink-hi)', fontSize: 11 }}>{l.label}</div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 1 }}>@{l.user}</div>
                </div>
                <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 11 }}>{l.prestige.toLocaleString()}</span>
                <DeltaChip value={l.delta} />
              </div>
            ))}
            {/* Payout bars */}
            <div style={{ padding: 10, background: 'var(--bg-tile)', borderTop: '2px solid var(--line)' }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>SEASON PAYOUT</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                {[1, 2, 3, 4, 5].map(r => (
                  <div key={r} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: [60, 46, 32, 20, 14][r - 1],
                      background: r === 2 ? 'var(--lime)' : r <= 3 ? 'var(--amber)' : 'var(--bg-elev)',
                      border: '1px solid var(--line)', position: 'relative',
                    }}>
                      {r === 2 && <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', color: 'var(--lime)', fontFamily: 'Silkscreen, monospace', fontSize: 9 }}>YOU</div>}
                    </div>
                    <div className="tag" style={{ fontSize: 8, color: 'var(--ink-low)', marginTop: 4 }}>#{r}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="WEEKLY OBJECTIVE" kicker="2 OF 4 DONE" color="var(--lime)">
            {MOCK_OBJECTIVES.map((o, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 12px', borderBottom: '1px solid var(--line-soft)',
                opacity: o.done ? 0.6 : 1,
              }}>
                <span style={{
                  width: 12, height: 12, background: o.done ? 'var(--lime)' : 'var(--bg-tile)',
                  color: '#100719', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontFamily: 'Silkscreen, monospace', border: '1px solid var(--line)', flexShrink: 0,
                }}>{o.done ? '✓' : ''}</span>
                <span className="tag" style={{ fontSize: 9, color: o.done ? 'var(--ink-low)' : 'var(--ink-hi)', textDecoration: o.done ? 'line-through' : 'none' }}>{o.label}</span>
              </div>
            ))}
          </Panel>

          {topArtist && (
            <Panel title="TOP ARTIST" kicker="BY PRESTIGE SCORE" color="var(--violet)">
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  {topArtist.image_url ? (
                    <img src={topArtist.image_url} alt={topArtist.name} style={{ width: 56, height: 56, objectFit: 'cover' }}/>
                  ) : (
                    <div style={{ width: 56, height: 56, background: avatarBg(topArtist.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, fontFamily: 'Silkscreen, monospace' }}>
                      {topArtist.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="display" style={{ fontSize: 26, color: 'var(--ink-hi)', lineHeight: 0.9 }}>{topArtist.name}</div>
                    <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 4 }}>{(topArtist.genre ?? '—').toUpperCase()}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'SCORE',     value: `${topArtist.score}/100`,              color: 'var(--lime)' },
                    { label: 'PRICE',     value: `$${(topArtist.price/1_000_000).toFixed(1)}M`, color: 'var(--amber)' },
                    { label: 'LISTENERS', value: fmtM(topArtist.monthly_listeners),     color: 'var(--cyan)' },
                    { label: 'TIER',      value: tierFromScore(topArtist.score),         color: TIER_COLORS[tierFromScore(topArtist.score)] },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'var(--bg-tile)', border: '1px solid var(--line)', padding: '6px 8px' }}>
                      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{label}</div>
                      <div className="tag" style={{ color, fontSize: 12, marginTop: 2 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
