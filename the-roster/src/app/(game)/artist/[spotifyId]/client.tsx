'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Artist, ArtistStats, Label, Scout } from '@/lib/types'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}
const TIER_BONUS_RANGES: Record<string, [number, number, number]> = {
  underground: [500, 2_000, 1_250],
  emerging: [5_000, 20_000, 12_500],
  rising: [20_000, 80_000, 50_000],
  established: [80_000, 300_000, 190_000],
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtListeners(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function MomentumRing({ score }: { score: number }) {
  const r = 36, cx = 44, cy = 44
  const circ = 2 * Math.PI * r
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circ
  return (
    <svg width="88" height="88" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-tile)" strokeWidth="8" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--lime)" strokeWidth="8"
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="square"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 6} textAnchor="middle" fontFamily="'Jersey 25', monospace" fontSize="22" fill="var(--lime)">{score}</text>
    </svg>
  )
}

function SparkBars({ data }: { data: { date: string; daily_streams_top10: number | null }[] }) {
  const values = [...data].reverse().map(d => d.daily_streams_top10 ?? 0)
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 28, gap: 2 }}>
      {values.map((v, i) => (
        <div key={i} style={{
          width: 6, height: `${(v / max) * 100}%`, minHeight: 2,
          background: 'var(--lime)', opacity: 0.7 + (i / values.length) * 0.3,
        }} />
      ))}
    </div>
  )
}

type ScoutReport = {
  pattern: 'organic' | 'spike' | 'mixed'
  bonusEstimate: number
  momentum: 'stable' | 'moderate' | 'volatile'
} | null

export default function ArtistProfileClient({
  artist, stats, spark, signedByCount, undergroundSignal, label, rosterCount,
  scout, activeScoutCount, scoutReport,
}: {
  artist: Artist
  stats: ArtistStats | null
  spark: { date: string; daily_streams_top10: number | null }[]
  signedByCount: number
  undergroundSignal: boolean
  label: Label
  rosterCount: number
  scout: Scout | null
  activeScoutCount: number
  scoutReport: ScoutReport
}) {
  const router = useRouter()
  const tierColor = TIER_COLORS[artist.tier] ?? 'var(--ink-mid)'
  const bonusRange = TIER_BONUS_RANGES[artist.tier]
  const defaultBonus = bonusRange ? bonusRange[2] : 0

  const [showModal, setShowModal] = useState(false)
  const [bonus, setBonus] = useState(defaultBonus)
  const [revSplit, setRevSplit] = useState(30)
  const [term, setTerm] = useState<3 | 6 | 12>(6)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [scouting, setScouting] = useState(false)
  const [scoutError, setScoutError] = useState('')

  const ml = stats?.monthly_listeners ?? 0
  const estWeekly = ml * 0.035 * (revSplit / 100)
  const treasuryAfter = label.treasury - bonus
  const breakEvenWeeks = estWeekly > 0 ? Math.ceil(bonus / estWeekly) : null
  const estTotal = estWeekly * (term * 4.33)

  const canSign = artist.tier !== 'major' && rosterCount < 5 && label.treasury >= bonus

  const scoutWeeksLeft = scout && !scout.completed_at
    ? Math.max(0, Math.ceil(
        (new Date(scout.completes_at + 'T00:00:00Z').getTime() - Date.now()) / (7 * 86400_000),
      ))
    : 0

  async function handleScout() {
    setScouting(true); setScoutError('')
    const res = await fetch('/api/scouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_id: artist.id }),
    })
    setScouting(false)
    if (!res.ok) {
      setScoutError((await res.json()).error ?? 'Scout failed')
      return
    }
    router.refresh()
  }

  async function confirmSign() {
    setSubmitting(true); setSubmitError('')
    const res = await fetch('/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_id: artist.id, signing_bonus: bonus, rev_split_label_pct: revSplit, term_months: term }),
    })
    if (!res.ok) {
      setSubmitError((await res.json()).error ?? 'Signing failed')
      setSubmitting(false); return
    }
    router.push('/dashboard')
  }

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 760, position: 'relative' }}>
      {/* Back */}
      <Link href="/search" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 10, color: 'var(--ink-low)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}>
        BACK TO SEARCH
      </Link>

      {/* Artist header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span className="tag" style={{ color: tierColor, border: `1px solid ${tierColor}`, padding: '2px 7px', fontSize: 9, background: `${tierColor}18` }}>
              {artist.tier.toUpperCase()}
            </span>
            {artist.country && <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{artist.country}</span>}
          </div>
          <div className="display" style={{ fontSize: 48, color: 'var(--ink-hi)', lineHeight: 0.85 }}>{artist.name}</div>
          {artist.genre && <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 8 }}>{artist.genre.toUpperCase()}</div>}
        </div>

        {/* Momentum ring */}
        <div style={{ textAlign: 'center' }}>
          {undergroundSignal ? (
            <div style={{ background: 'var(--bg-tile)', border: '2px solid var(--line)', padding: '14px 18px' }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>LOW SIGNAL</div>
              <div style={{ color: 'var(--ink-mid)', fontSize: 11, marginTop: 4, maxWidth: 120 }}>
                Not enough data for a reliable score
              </div>
            </div>
          ) : stats?.momentum_score != null ? (
            <div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>MOMENTUM</div>
              <MomentumRing score={Math.round(stats.momentum_score)} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>MONTHLY LISTENERS</div>
          <div className="display" style={{ fontSize: 28, color: 'var(--cyan)', lineHeight: 1, marginTop: 4 }}>
            {fmtListeners(ml)}
          </div>
          {stats?.listener_growth_28d != null && (
            <div className="tag" style={{ color: stats.listener_growth_28d >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 9, marginTop: 4 }}>
              {stats.listener_growth_28d >= 0 ? '+' : ''}{stats.listener_growth_28d.toFixed(1)}% (28d)
            </div>
          )}
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>7-DAY STREAMS (TOP 10)</div>
          <div style={{ marginTop: 8 }}>
            <SparkBars data={spark} />
          </div>
        </div>
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 12 }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNED BY</div>
          <div className="display" style={{ fontSize: 28, color: 'var(--ink-hi)', lineHeight: 1, marginTop: 4 }}>
            {signedByCount} LABEL{signedByCount !== 1 ? 'S' : ''}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => setShowModal(true)}
          disabled={!canSign}
          style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px',
            border: `2px solid ${canSign ? 'var(--lime)' : 'var(--line)'}`,
            color: canSign ? 'var(--lime)' : 'var(--ink-low)',
            background: canSign ? 'rgba(200,255,58,0.08)' : 'transparent',
            cursor: canSign ? 'pointer' : 'not-allowed',
            letterSpacing: 1,
          }}
        >
          {rosterCount >= 5 ? 'ROSTER FULL' : artist.tier === 'major' ? 'NOT SIGNABLE' : 'MAKE AN OFFER'}
        </button>
        <button
          disabled
          title="Phase 4 feature"
          style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 16px',
            border: '1px solid var(--line)', color: 'var(--ink-low)', background: 'transparent',
            cursor: 'not-allowed', letterSpacing: 1, opacity: 0.5,
          }}
        >
          + WATCHLIST
        </button>
      </div>

      {/* SCOUT section */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
        <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 10 }}>SCOUT</div>
        {!scout ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleScout}
              disabled={scouting || activeScoutCount >= 8}
              style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px',
                border: `2px solid ${activeScoutCount >= 8 ? 'var(--line)' : 'var(--amber)'}`,
                color: activeScoutCount >= 8 ? 'var(--ink-low)' : 'var(--amber)',
                background: activeScoutCount >= 8 ? 'transparent' : 'rgba(255,176,32,0.08)',
                cursor: activeScoutCount >= 8 || scouting ? 'not-allowed' : 'pointer',
                letterSpacing: 1,
              }}
            >
              {scouting ? 'STARTING...' : 'SCOUT THIS ARTIST'}
            </button>
            {activeScoutCount >= 8 && (
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>0 scout slots remaining</span>
            )}
            {scoutError && <span className="tag" style={{ color: 'var(--rose)', fontSize: 9 }}>{scoutError}</span>}
          </div>
        ) : !scout.completed_at ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', border: '1px solid var(--amber)', background: 'rgba(255,176,32,0.08)',
          }}>
            <span className="tag" style={{ color: 'var(--amber)', fontSize: 10 }}>
              SCOUTING · {scoutWeeksLeft} WEEK{scoutWeeksLeft !== 1 ? 'S' : ''} REMAINING
            </span>
          </div>
        ) : scoutReport ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>STREAM PATTERN</span>
              <span className="tag" style={{
                fontSize: 10,
                color: scoutReport.pattern === 'organic' ? 'var(--lime)' : scoutReport.pattern === 'spike' ? 'var(--rose)' : 'var(--amber)',
              }}>{scoutReport.pattern.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNING BONUS EST.</span>
              <span className="tag" style={{ color: 'var(--lime)', fontSize: 10 }}>~{fmtUSD(scoutReport.bonusEstimate)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>MOMENTUM</span>
              <span className="tag" style={{
                fontSize: 10,
                color: scoutReport.momentum === 'stable' ? 'var(--lime)' : scoutReport.momentum === 'volatile' ? 'var(--rose)' : 'var(--amber)',
              }}>{scoutReport.momentum.toUpperCase()}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--ink-mid)', fontSize: 12 }}>Scout complete — no stats available</div>
        )}
      </div>

      {/* Signing modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--bg-panel)', border: '2px solid var(--line)',
            padding: 28, width: '100%', maxWidth: 460,
          }}>
            <div className="tag" style={{ color: 'var(--lime)', fontSize: 10, marginBottom: 20 }}>
              MAKE AN OFFER -- {artist.name.toUpperCase()}
            </div>

            {/* Signing bonus */}
            <div style={{ marginBottom: 16 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>SIGNING BONUS</div>
              {bonusRange && (
                <input type="range" min={bonusRange[0]} max={bonusRange[1]}
                  value={bonus} onChange={e => setBonus(Number(e.target.value))}
                  style={{ width: '100%', marginBottom: 6, accentColor: 'var(--lime)' }}
                />
              )}
              <input type="number" value={bonus}
                min={bonusRange?.[0] ?? 0} max={bonusRange?.[1] ?? 999_999}
                onChange={e => setBonus(Number(e.target.value))}
                style={{
                  background: 'var(--bg-tile)', border: '1px solid var(--line)',
                  color: 'var(--amber)', fontFamily: 'Jersey 25, monospace', fontSize: 24,
                  padding: '6px 10px', width: '100%', outline: 'none',
                }}
              />
            </div>

            {/* Rev split */}
            <div style={{ marginBottom: 16 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>
                LABEL REVENUE SPLIT: {revSplit}%
              </div>
              <input type="range" min={10} max={50} value={revSplit}
                onChange={e => setRevSplit(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cyan)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>10% (artist-friendly)</span>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>50% (label-heavy)</span>
              </div>
            </div>

            {/* Term */}
            <div style={{ marginBottom: 20 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>CONTRACT TERM</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([3, 6, 12] as const).map(t => (
                  <button key={t} onClick={() => setTerm(t)} style={{
                    flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px',
                    border: `2px solid ${term === t ? 'var(--lime)' : 'var(--line)'}`,
                    color: term === t ? 'var(--lime)' : 'var(--ink-mid)',
                    background: term === t ? 'rgba(200,255,58,0.08)' : 'transparent', cursor: 'pointer',
                  }}>{t} MO</button>
                ))}
              </div>
            </div>

            {/* Live preview */}
            <div style={{ background: 'var(--bg-tile)', border: '1px solid var(--line)', padding: 12, marginBottom: 20 }}>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 8 }}>DEAL PREVIEW</div>
              {[
                { label: 'EST. WEEKLY ROYALTIES', value: fmtUSD(estWeekly), color: 'var(--lime)' },
                { label: 'TREASURY AFTER SIGNING', value: fmtUSD(treasuryAfter), color: treasuryAfter < 0 ? 'var(--rose)' : 'var(--amber)' },
                { label: 'BREAK-EVEN', value: breakEvenWeeks ? `${breakEvenWeeks} WEEKS` : 'N/A', color: 'var(--cyan)' },
                { label: `EST. TOTAL (${term} MO)`, value: fmtUSD(estTotal), color: 'var(--violet)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{label}</span>
                  <span className="tag" style={{ color, fontSize: 10 }}>{value}</span>
                </div>
              ))}
            </div>

            {submitError && <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginBottom: 8 }}>{submitError}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{
                flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                border: '1px solid var(--line)', color: 'var(--ink-mid)', background: 'transparent', cursor: 'pointer',
              }}>CANCEL</button>
              <button onClick={confirmSign} disabled={submitting || treasuryAfter < 0} style={{
                flex: 2, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                border: '2px solid var(--lime)', color: 'var(--lime)',
                background: 'rgba(200,255,58,0.1)', cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting || treasuryAfter < 0 ? 0.5 : 1,
              }}>
                {submitting ? 'SIGNING...' : 'CONFIRM SIGNING'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
