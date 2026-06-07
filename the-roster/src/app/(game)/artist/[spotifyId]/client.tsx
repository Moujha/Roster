'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Artist, ArtistStats, Label, Scout } from '@/lib/types'
import type { SpotifyEnrichment, SpotifyRelease } from '@/lib/spotify'

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

// Artist voice — tier-appropriate quotes for each negotiation phase
type VoicePhase = 'accepted_clean' | 'accepted_counter' | 'accepted_round2' | 'countered' | 'rejected_outright' | 'rejected_round2' | 'cooling_off'

function artistVoice(tier: string, phase: VoicePhase): string {
  const voices: Record<string, Record<VoicePhase, string>> = {
    underground: {
      accepted_clean:   "You saw something before the numbers backed it up. That's rare. Let's go.",
      accepted_counter: "You listened. That matters more than the money. We're doing this.",
      accepted_round2:  "You held your ground. I respect that. Deal.",
      countered:        "I'm interested, but I need to know you respect what I'm building. Look at what I changed.",
      rejected_outright:"That offer tells me you don't know what you're signing. Come back when you do.",
      rejected_round2:  "We tried twice. It didn't land. I need to move on.",
      cooling_off:      "We had this conversation already. I said I'd be available after a certain date. That date hasn't come.",
    },
    emerging: {
      accepted_clean:   "Your offer says you believe in where I'm heading. I'm in.",
      accepted_counter: "You adjusted. That tells me you're serious. Let's build.",
      accepted_round2:  "Second round, better terms. You came through. We're signing.",
      countered:        "The offer's not far off, but something needs to move. See what I adjusted.",
      rejected_outright:"My team looked at this and said no. So did I. Not close enough.",
      rejected_round2:  "I gave you a second chance and the terms didn't move. I'm done on this one.",
      cooling_off:      "My team is still processing where things left off. We said we'd be open to talking again after a certain date.",
    },
    rising: {
      accepted_clean:   "These terms work for both of us. You read the room. Let's go.",
      accepted_counter: "You came back with a better offer. That's what I was looking for. Deal.",
      accepted_round2:  "I'm glad we got there. Two rounds, but we got there. Welcome.",
      countered:        "There's potential here, but I need one thing to change. Check the revised terms.",
      rejected_outright:"My management reviewed this and we're not engaging. It's not the right offer.",
      rejected_round2:  "We went two rounds. It wasn't enough. I've got to keep moving.",
      cooling_off:      "There were talks and they didn't go anywhere. I asked for some time before reopening. We're not there yet.",
    },
    established: {
      accepted_clean:   "The numbers work. You know what you're doing. Welcome to the label.",
      accepted_counter: "You came back with the right adjustment. We can work with this.",
      accepted_round2:  "Two rounds to get here, but the final offer is solid. Let's move.",
      countered:        "Interesting offer. One variable isn't sitting right with my team. We've put forward something that works better for us.",
      rejected_outright:"We don't negotiate from that position. When you're ready to have a serious conversation, reach out.",
      rejected_round2:  "We gave two rounds. The offer didn't reflect where we need to be. We're stepping away.",
      cooling_off:      "My team has been clear — we're not entertaining new conversations until a specific date has passed.",
    },
  }
  const tier_voices = voices[tier] ?? voices.emerging
  return tier_voices[phase]
}

// §4.5 Live offer likelihood indicator — qualitative only, no numbers
type IndicatorState = { color: 'green' | 'yellow' | 'red'; label: string; hint: string | null }

function computeIndicator(
  tier: string,
  bonus: number,
  revSplit: number,
  term: 3 | 6 | 12,
  bonusRange: [number, number, number] | undefined,
  hasScouted: boolean,
  negotiationHint: string | null,
): IndicatorState {
  const dominant = tier === 'established' ? 'bonus' : tier === 'rising' ? 'term' : 'split'

  function scoreBonus() {
    if (!bonusRange) return 50
    return Math.max(0, Math.min(100, (bonus - bonusRange[0]) / (bonusRange[1] - bonusRange[0]) * 100))
  }
  function scoreSplit() { return (40 - revSplit) / 20 * 100 }
  function scoreTerm() { return term === 12 ? 100 : term === 6 ? 50 : 0 }

  const dominantScore = dominant === 'bonus' ? scoreBonus() : dominant === 'split' ? scoreSplit() : scoreTerm()

  if (!hasScouted) {
    if (dominantScore >= 65) return { color: 'green', label: 'LOOKS PROMISING', hint: null }
    if (dominantScore >= 35) return { color: 'yellow', label: 'HARD TO READ', hint: null }
    return { color: 'red', label: 'LIKELY MISALIGNED', hint: null }
  }

  // With scout — identify variable from hint text, more precise
  let hintVar: 'split' | 'bonus' | 'term' | null = null
  if (negotiationHint) {
    if (/split|creative|control|independence/i.test(negotiationHint)) hintVar = 'split'
    else if (/bonus|market value|money|guarantee|offer/i.test(negotiationHint)) hintVar = 'bonus'
    else if (/term|stability|commitment|long|partner/i.test(negotiationHint)) hintVar = 'term'
  }
  const hintScore = hintVar === 'split' ? scoreSplit() : hintVar === 'bonus' ? scoreBonus() : hintVar === 'term' ? scoreTerm() : dominantScore
  const combined = dominantScore * 0.55 + hintScore * 0.45

  const hintLine = (v: 'split' | 'bonus' | 'term' | null) =>
    v === 'split' ? 'Split appears to be the weak point.' :
    v === 'bonus' ? 'Bonus may not be landing.' :
    v === 'term' ? 'Term length may be misaligned.' : null

  if (combined >= 75) return { color: 'green', label: 'STRONG MATCH', hint: null }
  if (combined >= 60) return { color: 'green', label: 'GOOD MATCH', hint: hintVar && hintScore < 70 ? `Consider a slightly more generous ${hintVar === 'split' ? 'split' : hintVar === 'bonus' ? 'bonus' : 'term'}.` : null }
  if (combined >= 45) return { color: 'yellow', label: 'PARTIAL MATCH', hint: hintLine(hintVar) }
  if (combined >= 30) return { color: 'yellow', label: 'WEAK SIGNAL', hint: hintLine(hintVar) ?? 'Terms may be misaligned.' }
  return { color: 'red', label: 'POOR MATCH', hint: 'Terms appear significantly misaligned.' }
}

function counterTell(original: { bonus: number; rev_split_label_pct: number; term_months: number }, counter: { bonus: number; rev_split_label_pct: number; term_months: number }): string {
  if (counter.rev_split_label_pct !== original.rev_split_label_pct) return "They moved the split. That tells you something."
  if (counter.bonus !== original.bonus) return "They pushed the bonus. Money matters to them."
  if (counter.term_months !== original.term_months) return "They changed the term. Think about what that signals."
  return "Look at what changed in their terms."
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
  negotiationHint: string | null
} | null

type NegPhase = 'idle' | 'waiting' | 'countered' | 'accepted' | 'rejected'

type CounterOffer = {
  bonus: number
  rev_split_label_pct: number
  term_months: 3 | 6 | 12
}

export default function ArtistProfileClient({
  artist, stats, spark, signedByCount, undergroundSignal, label, rosterCount,
  scout, activeScoutCount, scoutReport, spotifyData,
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
  spotifyData: SpotifyEnrichment | null
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

  // Negotiation state
  const [negPhase, setNegPhase] = useState<NegPhase>('idle')
  const [negId, setNegId] = useState<string | null>(null)
  const [counterOffer, setCounterOffer] = useState<CounterOffer | null>(null)
  const [originalOffer, setOriginalOffer] = useState<CounterOffer | null>(null)
  const [coolingOffUntil, setCoolingOffUntil] = useState<string | null>(null)
  const [acceptedViaCounter, setAcceptedViaCounter] = useState(false)
  const [rejectionType, setRejectionType] = useState<'outright' | 'round2' | 'cooldown'>('outright')
  const negRound = negId ? 2 : 1

  // Waiting interstitial — stores resolved outcome until delay elapses
  const [pendingPhase, setPendingPhase] = useState<NegPhase | null>(null)
  const [waitingText] = useState(() => {
    const lines = [
      'Passing it to their team…',
      'Their manager is reviewing…',
      'Reading your offer…',
      'Taking a moment…',
    ]
    return lines[Math.floor(Math.random() * lines.length)]
  })

  // Live likelihood indicator — debounced, qualitative only
  const [indicator, setIndicator] = useState<IndicatorState | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      setIndicator(computeIndicator(
        artist.tier, bonus, revSplit, term, bonusRange,
        !!scoutReport, scoutReport?.negotiationHint ?? null,
      ))
    }, 280)
    return () => clearTimeout(t)
  }, [bonus, revSplit, term]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reveal result after 1.8–2.5s interstitial
  useEffect(() => {
    if (negPhase !== 'waiting' || !pendingPhase) return
    const delay = 1800 + Math.random() * 700
    const t = setTimeout(() => setNegPhase(pendingPhase), delay)
    return () => clearTimeout(t)
  }, [negPhase, pendingPhase]) // eslint-disable-line react-hooks/exhaustive-deps

  const ml = stats?.monthly_listeners ?? 0
  const estWeekly = ml * 0.035 * (revSplit / 100)
  const treasuryAfter = label.treasury - bonus
  const breakEvenWeeks = estWeekly > 0 ? Math.ceil(bonus / estWeekly) : null
  const estTotal = estWeekly * (term * 4.33)

  const canSign = artist.tier !== 'major' && rosterCount < 5 && label.treasury >= bonus

  function resetModal() {
    setNegPhase('idle')
    setNegId(null)
    setCounterOffer(null)
    setOriginalOffer(null)
    setCoolingOffUntil(null)
    setAcceptedViaCounter(false)
    setRejectionType('outright')
    setSubmitError('')
  }

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

  async function sendOffer(opts: { acceptCounter?: boolean } = {}) {
    setSubmitting(true); setSubmitError('')
    const body: Record<string, unknown> = {
      artist_id: artist.id,
      bonus,
      rev_split_label_pct: revSplit,
      term_months: term,
    }
    if (negId) body.negotiation_id = negId
    if (opts.acceptCounter) body.accept_counter = true

    const res = await fetch('/api/contracts/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSubmitting(false)

    const data = await res.json()

    if (!res.ok) {
      // Cooling-off 409 → show storytelling screen, not red text
      if (res.status === 409 && data.cooling_off_until) {
        setCoolingOffUntil(data.cooling_off_until)
        setRejectionType('cooldown')
        setNegPhase('rejected')
        return
      }
      setSubmitError(data.error ?? 'Offer failed')
      return
    }

    if (data.outcome === 'accepted') {
      setPendingPhase('accepted')
    } else if (data.outcome === 'countered') {
      setOriginalOffer({ bonus, rev_split_label_pct: revSplit, term_months: term })
      setNegId(data.negotiation_id)
      setCounterOffer(data.counter)
      setPendingPhase('countered')
    } else if (data.outcome === 'rejected') {
      setCoolingOffUntil(data.cooling_off_until ?? null)
      setRejectionType(negRound === 2 ? 'round2' : 'outright')
      setPendingPhase('rejected')
    }
    setNegPhase('waiting')
  }

  async function acceptCounter() {
    if (!counterOffer) return
    setSubmitting(true); setSubmitError('')

    const res = await fetch('/api/contracts/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist_id: artist.id,
        bonus: counterOffer.bonus,
        rev_split_label_pct: counterOffer.rev_split_label_pct,
        term_months: counterOffer.term_months,
        negotiation_id: negId,
        accept_counter: true,
      }),
    })
    setSubmitting(false)
    const data = await res.json()
    if (!res.ok) { setSubmitError(data.error ?? 'Accept failed'); return }
    if (data.outcome === 'accepted') {
      setAcceptedViaCounter(true)
      setPendingPhase('accepted')
      setNegPhase('waiting')
    }
  }

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 760, position: 'relative' }}>
      {/* Back */}
      <Link href="/search" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 10, color: 'var(--ink-low)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}>
        BACK TO SEARCH
      </Link>

      {/* Artist header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginBottom: 24 }}>

        {/* Photo or placeholder */}
        {spotifyData?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spotifyData.image_url}
            alt={artist.name}
            referrerPolicy="no-referrer"
            style={{
              width: 120, height: 120, objectFit: 'cover', flexShrink: 0,
              border: `2px solid ${tierColor}`,
            }}
          />
        ) : (
          <div style={{
            width: 120, height: 120, flexShrink: 0,
            background: `${tierColor}18`, border: `2px solid ${tierColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 32, color: tierColor }}>
              {artist.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="tag" style={{ color: tierColor, border: `1px solid ${tierColor}`, padding: '2px 7px', fontSize: 9, background: `${tierColor}18` }}>
              {artist.tier.toUpperCase()}
            </span>
            {artist.country && (
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, border: '1px solid var(--line)', padding: '2px 6px' }}>
                {artist.country}
              </span>
            )}
            {artist.genre && (
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, border: '1px solid var(--line)', padding: '2px 6px' }}>
                {artist.genre.toUpperCase()}
              </span>
            )}
          </div>
          <div className="display" style={{ fontSize: 42, color: 'var(--ink-hi)', lineHeight: 0.85, marginBottom: 12 }}>{artist.name}</div>

          {/* Momentum or low-signal */}
          {undergroundSignal ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg-tile)', border: '1px solid var(--line)' }}>
              <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>LOW SIGNAL</span>
              <span style={{ color: 'var(--ink-mid)', fontSize: 10 }}>Not enough data for a reliable score</span>
            </div>
          ) : stats?.momentum_score != null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>MOMENTUM</div>
                <MomentumRing score={Math.round(stats.momentum_score)} />
              </div>
              {stats.stream_velocity_7d != null && (
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>7D VELOCITY</div>
                  <div className="display" style={{ fontSize: 22, color: stats.stream_velocity_7d >= 0 ? 'var(--lime)' : 'var(--rose)', lineHeight: 1 }}>
                    {stats.stream_velocity_7d >= 0 ? '+' : ''}{stats.stream_velocity_7d.toFixed(1)}%
                  </div>
                </div>
              )}
              {stats.catalog_depth_score != null && (
                <div>
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>CATALOG DEPTH</div>
                  <div className="display" style={{ fontSize: 22, color: 'var(--cyan)', lineHeight: 1 }}>
                    {stats.catalog_depth_score.toFixed(0)}
                  </div>
                </div>
              )}
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
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
        {spotifyData?.spotify_url && (
          <a
            href={spotifyData.spotify_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 16px',
              border: '1px solid #1DB954', color: '#1DB954', background: 'rgba(29,185,84,0.08)',
              textDecoration: 'none', letterSpacing: 1, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            ▶ SPOTIFY
          </a>
        )}
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

      {/* Recent releases */}
      {spotifyData?.releases && spotifyData.releases.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line-soft)' }}>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 12 }}>DISCOGRAPHY</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {spotifyData.releases.map((rel: SpotifyRelease, i: number) => (
              <a
                key={i}
                href={rel.spotify_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', flexShrink: 0, width: 110 }}
              >
                <div style={{
                  width: 110, height: 110, overflow: 'hidden',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-tile)',
                  marginBottom: 6,
                }}>
                  {rel.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rel.image_url}
                      alt={rel.name}
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: 'Silkscreen, monospace', fontSize: 22, color: 'var(--ink-low)' }}>♪</span>
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--ink-hi)', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {rel.name}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                  <span className="tag" style={{ fontSize: 8, color: 'var(--ink-low)' }}>
                    {rel.album_type === 'single' ? 'SINGLE' : rel.album_type === 'compilation' ? 'COMP.' : 'ALBUM'}
                  </span>
                  <span className="tag" style={{ fontSize: 8, color: 'var(--ink-low)' }}>
                    {rel.release_date.slice(0, 4)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

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
            {scoutReport.negotiationHint && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-panel)', border: '2px solid var(--violet)' }}>
                <div className="tag" style={{ color: 'var(--violet)', fontSize: 9, marginBottom: 4 }}>NEGOTIATION INTEL</div>
                <div style={{ color: 'var(--ink-mid)', fontSize: 11 }}>{scoutReport.negotiationHint}</div>
              </div>
            )}
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

            {/* ── WAITING ── */}
            {negPhase === 'waiting' ? (
              <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                <style>{`
                  @keyframes rDotBounce {
                    0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
                    40%           { transform: translateY(-8px); opacity: 1; }
                  }
                  @media (prefers-reduced-motion: reduce) {
                    .r-dot { animation: none !important; opacity: 0.7 !important; }
                  }
                `}</style>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="r-dot" style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--ink-mid)',
                      animation: `rDotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 10, letterSpacing: 1 }}>
                  {waitingText}
                </div>
              </div>

            ) : negPhase === 'accepted' ? (
              <div style={{ padding: '4px 0' }}>
                <div className="tag" style={{ color: 'var(--lime)', fontSize: 9, letterSpacing: 2, marginBottom: 16 }}>SIGNED</div>
                <div className="display" style={{ fontSize: 40, color: 'var(--lime)', lineHeight: 0.85, marginBottom: 20 }}>
                  {artist.name}
                </div>

                {/* Artist quote */}
                <div style={{ padding: '14px 16px', background: 'rgba(200,255,58,0.04)', border: '1px solid rgba(200,255,58,0.25)', marginBottom: 20 }}>
                  <div style={{ color: 'var(--ink-hi)', fontSize: 13, lineHeight: 1.65, fontStyle: 'italic', marginBottom: 8 }}>
                    &ldquo;{artistVoice(artist.tier, acceptedViaCounter ? 'accepted_counter' : negRound === 2 ? 'accepted_round2' : 'accepted_clean')}&rdquo;
                  </div>
                  <div className="tag" style={{ color: 'var(--lime)', fontSize: 9 }}>— {artist.name}</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
                  {[
                    { label: 'SIGNING BONUS', value: fmtUSD(acceptedViaCounter && counterOffer ? counterOffer.bonus : bonus) },
                    { label: 'SPLIT', value: `${100 - (acceptedViaCounter && counterOffer ? counterOffer.rev_split_label_pct : revSplit)}% ARTIST / ${acceptedViaCounter && counterOffer ? counterOffer.rev_split_label_pct : revSplit}% LABEL` },
                    { label: 'TERM', value: `${acceptedViaCounter && counterOffer ? counterOffer.term_months : term} MONTHS` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', background: 'var(--bg-tile)' }}>
                      <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{label}</span>
                      <span className="tag" style={{ color: 'var(--lime)', fontSize: 9 }}>{value}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => router.push('/dashboard')} style={{
                  width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '12px',
                  border: '2px solid var(--lime)', color: 'var(--lime)',
                  background: 'rgba(200,255,58,0.08)', cursor: 'pointer', letterSpacing: 1,
                }}>TO THE ROSTER →</button>
              </div>

            ) : negPhase === 'rejected' ? (
              /* ── REJECTED / COOLING OFF ── */
              <div style={{ padding: '4px 0' }}>
                <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, letterSpacing: 2, marginBottom: 16 }}>
                  {rejectionType === 'cooldown' ? 'NOT NOW' : rejectionType === 'round2' ? 'TALKS BROKE DOWN' : 'OFFER DECLINED'}
                </div>
                <div className="display" style={{ fontSize: 40, color: 'var(--ink-hi)', lineHeight: 0.85, marginBottom: 20 }}>
                  {artist.name}
                </div>

                {/* Artist quote */}
                <div style={{ padding: '14px 16px', background: 'rgba(255,70,70,0.04)', border: '1px solid rgba(255,70,70,0.25)', marginBottom: 20 }}>
                  <div style={{ color: 'var(--ink-hi)', fontSize: 13, lineHeight: 1.65, fontStyle: 'italic', marginBottom: 8 }}>
                    &ldquo;{artistVoice(artist.tier, rejectionType === 'cooldown' ? 'cooling_off' : rejectionType === 'round2' ? 'rejected_round2' : 'rejected_outright')}&rdquo;
                  </div>
                  <div className="tag" style={{ color: 'var(--rose)', fontSize: 9 }}>— {artist.name}</div>
                </div>

                {coolingOffUntil && (
                  <div style={{ padding: '8px 12px', background: 'var(--bg-tile)', border: '1px solid var(--line)', marginBottom: 20 }}>
                    <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 3 }}>AVAILABLE AGAIN</div>
                    <div style={{ color: 'var(--ink-mid)', fontSize: 12 }}>
                      {coolingOffUntil} · Other labels can still sign them in the meantime.
                    </div>
                  </div>
                )}

                <button onClick={() => { setShowModal(false); resetModal() }} style={{
                  width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                  border: '1px solid var(--line)', color: 'var(--ink-low)', background: 'transparent', cursor: 'pointer',
                }}>CLOSE</button>
              </div>

            ) : negPhase === 'countered' && counterOffer ? (
              /* ── COUNTERED ── */
              <div style={{ padding: '4px 0' }}>
                <div className="tag" style={{ color: 'var(--amber)', fontSize: 9, letterSpacing: 2, marginBottom: 16 }}>
                  RESPONSE FROM {artist.name.toUpperCase()}
                </div>

                {/* Artist quote */}
                <div style={{ padding: '14px 16px', background: 'rgba(255,176,32,0.04)', border: '1px solid rgba(255,176,32,0.3)', marginBottom: 20 }}>
                  <div style={{ color: 'var(--ink-hi)', fontSize: 13, lineHeight: 1.65, fontStyle: 'italic', marginBottom: 8 }}>
                    &ldquo;{artistVoice(artist.tier, 'countered')}&rdquo;
                  </div>
                  <div className="tag" style={{ color: 'var(--amber)', fontSize: 9 }}>— {artist.name}</div>
                </div>

                {/* Counter terms diff */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                  {([
                    {
                      label: 'SIGNING BONUS',
                      prev: fmtUSD(originalOffer?.bonus ?? bonus),
                      next: fmtUSD(counterOffer.bonus),
                      changed: counterOffer.bonus !== (originalOffer?.bonus ?? bonus),
                    },
                    {
                      label: 'SPLIT',
                      prev: `${100 - (originalOffer?.rev_split_label_pct ?? revSplit)}% / ${originalOffer?.rev_split_label_pct ?? revSplit}%`,
                      next: `${100 - counterOffer.rev_split_label_pct}% / ${counterOffer.rev_split_label_pct}%`,
                      changed: counterOffer.rev_split_label_pct !== (originalOffer?.rev_split_label_pct ?? revSplit),
                    },
                    {
                      label: 'TERM',
                      prev: `${originalOffer?.term_months ?? term} mo`,
                      next: `${counterOffer.term_months} mo`,
                      changed: counterOffer.term_months !== (originalOffer?.term_months ?? term),
                    },
                  ] as { label: string; prev: string; next: string; changed: boolean }[]).map(({ label, prev, next, changed }) => (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 12px',
                      background: changed ? 'rgba(255,176,32,0.08)' : 'var(--bg-tile)',
                      border: `1px solid ${changed ? 'var(--amber)' : 'var(--line)'}`,
                    }}>
                      <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{label}</span>
                      <span className="tag" style={{ fontSize: 10 }}>
                        {changed ? (
                          <><span style={{ color: 'var(--ink-low)', textDecoration: 'line-through', marginRight: 8 }}>{prev}</span><span style={{ color: 'var(--amber)' }}>{next}</span></>
                        ) : (
                          <span style={{ color: 'var(--ink-mid)' }}>{next}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                {/* The tell */}
                {originalOffer && (
                  <div style={{ padding: '7px 12px', marginBottom: 16, borderLeft: '2px solid var(--amber)' }}>
                    <div style={{ color: 'var(--amber)', fontSize: 11, fontStyle: 'italic' }}>
                      {counterTell(originalOffer, counterOffer)}
                    </div>
                  </div>
                )}

                {submitError && <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginBottom: 8 }}>{submitError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowModal(false); resetModal() }} style={{
                    flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                    border: '1px solid var(--line)', color: 'var(--ink-low)', background: 'transparent', cursor: 'pointer',
                  }}>WALK AWAY</button>
                  <button onClick={() => { setBonus(counterOffer.bonus); setRevSplit(counterOffer.rev_split_label_pct); setTerm(counterOffer.term_months); setNegPhase('idle') }} style={{
                    flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                    border: '2px solid var(--cyan)', color: 'var(--cyan)',
                    background: 'rgba(0,210,255,0.08)', cursor: 'pointer',
                  }}>MODIFY →</button>
                  <button onClick={acceptCounter} disabled={submitting} style={{
                    flex: 2, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                    border: '2px solid var(--amber)', color: 'var(--amber)',
                    background: 'rgba(255,176,32,0.1)', cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.5 : 1,
                  }}>{submitting ? 'SIGNING...' : 'ACCEPT COUNTER'}</button>
                </div>
              </div>

            ) : (
              /* ── OFFER FORM (round 1 or round 2) ── */
              <>
                <div style={{ marginBottom: negRound === 2 ? 8 : 20 }}>
                  <div className="tag" style={{ color: 'var(--lime)', fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                    {negRound === 2 ? 'FINAL OFFER' : 'MAKE AN OFFER'}
                  </div>
                  <div className="display" style={{ fontSize: 28, color: 'var(--ink-hi)', lineHeight: 0.9 }}>
                    {artist.name}
                  </div>
                </div>
                {negRound === 2 && (
                  <div style={{ padding: '8px 12px', background: 'rgba(255,176,32,0.06)', border: '1px solid var(--amber)', marginBottom: 16 }}>
                    <div style={{ color: 'var(--amber)', fontSize: 12 }}>
                      Round two. This is your last shot — if this doesn&apos;t land, the deal dies.
                    </div>
                  </div>
                )}

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
                    SPLIT — ARTIST {100 - revSplit}% / LABEL {revSplit}%
                  </div>
                  <input type="range" min={20} max={40} value={revSplit}
                    onChange={e => setRevSplit(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--cyan)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>80/20 artist-friendly</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>60/40 label-heavy</span>
                  </div>
                </div>

                {/* Term */}
                <div style={{ marginBottom: 16 }}>
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

                {/* Live likelihood indicator — §4.5 */}
                {indicator && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', marginBottom: 14,
                    background: indicator.color === 'green' ? 'rgba(200,255,58,0.06)' : indicator.color === 'red' ? 'rgba(255,70,70,0.06)' : 'rgba(255,176,32,0.06)',
                    border: `1px solid ${indicator.color === 'green' ? 'var(--lime)' : indicator.color === 'red' ? 'var(--rose)' : 'var(--amber)'}`,
                  }}>
                    <div>
                      <div className="tag" style={{
                        color: indicator.color === 'green' ? 'var(--lime)' : indicator.color === 'red' ? 'var(--rose)' : 'var(--amber)',
                        fontSize: 9,
                      }}>
                        ● {indicator.label}
                      </div>
                      {indicator.hint && (
                        <div style={{ color: 'var(--ink-low)', fontSize: 10, marginTop: 3 }}>{indicator.hint}</div>
                      )}
                    </div>
                    {!scoutReport && (
                      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>PUBLIC SIGNAL ONLY</div>
                    )}
                  </div>
                )}

                {/* Deal preview */}
                <div style={{ background: 'var(--bg-tile)', border: '1px solid var(--line)', padding: 12, marginBottom: 16 }}>
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
                  <button onClick={() => { setShowModal(false); resetModal() }} style={{
                    flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                    border: '1px solid var(--line)', color: 'var(--ink-mid)', background: 'transparent', cursor: 'pointer',
                  }}>CANCEL</button>
                  <button onClick={() => sendOffer()} disabled={submitting || treasuryAfter < 0} style={{
                    flex: 2, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                    border: '2px solid var(--lime)', color: 'var(--lime)',
                    background: 'rgba(200,255,58,0.1)', cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting || treasuryAfter < 0 ? 0.5 : 1,
                  }}>
                    {submitting ? 'SENDING...' : negRound === 2 ? 'SEND FINAL OFFER →' : 'SEND OFFER →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
