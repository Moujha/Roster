'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Contract } from '@/lib/types'

type ContractRow = Contract & { artists: { name: string; tier: string; spotify_id: string } }

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function fmtUSD(n: number) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}
function fmtListeners(n: number | null | undefined) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}
function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

const STEPS = 3

export default function ContractExpiryScreen({
  contracts,
  listenerMap,
}: {
  contracts: ContractRow[]
  listenerMap: Map<string, number | null>
}) {
  const router = useRouter()
  const [contractIdx, setContractIdx] = useState(0)
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [releasing, setReleasing] = useState(false)

  useEffect(() => {
    const firstUnseen = contracts.findIndex(
      c => !localStorage.getItem(`roster_expiry_seen_${c.id}`)
    )
    if (firstUnseen !== -1) { setContractIdx(firstUnseen); setVisible(true) }
  }, [contracts])

  if (!visible || contracts.length === 0) return null

  const c = contracts[contractIdx]
  if (!c) return null

  const tierColor = TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)'
  const netPnl = c.royalties_earned - c.signing_bonus - c.dev_spend_total
  const nowListeners = listenerMap.get(c.artist_id) ?? null
  const listenerDelta = nowListeners != null && c.baseline_listeners != null
    ? nowListeners - c.baseline_listeners : null
  const listenerGrowthPct = listenerDelta != null && c.baseline_listeners
    ? (listenerDelta / c.baseline_listeners) * 100 : null

  function advanceOrClose() {
    localStorage.setItem(`roster_expiry_seen_${c.id}`, '1')
    const nextUnseen = contracts.findIndex(
      (con, i) => i > contractIdx && !localStorage.getItem(`roster_expiry_seen_${con.id}`)
    )
    if (nextUnseen !== -1) { setContractIdx(nextUnseen); setStep(0) }
    else setVisible(false)
  }

  async function handleRelease() {
    setReleasing(true)
    await fetch(`/api/contracts/${c.id}/release`, { method: 'POST' })
    setReleasing(false)
    advanceOrClose()
    router.refresh()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 210,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <style>{`
        @keyframes exFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ex-step { animation: exFadeUp 300ms ease both; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <div key={i} style={{
              height: 3, flex: i === step ? 3 : 1,
              background: i <= step ? 'var(--rose)' : 'var(--bg-tile)',
              transition: 'flex 280ms ease, background 280ms ease',
            }} />
          ))}
        </div>

        {/* ── Step 0: Contract overview ── */}
        {step === 0 && (
          <div key="s0" className="ex-step">
            <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, letterSpacing: 2, marginBottom: 20 }}>
              CONTRACT ENDED
            </div>
            <div className="display" style={{ fontSize: 44, color: 'var(--ink-hi)', lineHeight: 0.85, marginBottom: 14 }}>
              {c.artists.name}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              <span className="tag" style={{
                color: tierColor, border: `1px solid ${tierColor}`,
                padding: '2px 7px', fontSize: 9, background: `${tierColor}18`,
              }}>{c.artists.tier.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 32 }}>
              {([
                { label: 'SIGNED', value: fmtDate(c.start_date) },
                { label: 'ENDED', value: fmtDate(c.end_date) },
                { label: 'TERM', value: `${c.term_months} months` },
                { label: 'SPLIT', value: `${100 - c.rev_split_label_pct}% artist / ${c.rev_split_label_pct}% label` },
                { label: 'SIGNING BONUS', value: fmtUSD(c.signing_bonus) },
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '7px 12px', background: 'var(--bg-panel)', border: '1px solid var(--line)',
                }}>
                  <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{label}</span>
                  <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 9 }}>{value}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)} style={{
              width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10,
              padding: '13px', border: '2px solid var(--line)', color: 'var(--ink-hi)',
              background: 'transparent', cursor: 'pointer', letterSpacing: 1,
            }}>SEE THE RESULTS →</button>
          </div>
        )}

        {/* ── Step 1: Outcome ── */}
        {step === 1 && (
          <div key="s1" className="ex-step">
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, letterSpacing: 2, marginBottom: 24 }}>
              THE OUTCOME
            </div>

            {/* Listener comparison */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 24px 1fr',
              gap: 8, alignItems: 'center', marginBottom: 28,
            }}>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-panel)', border: '1px solid var(--line)' }}>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginBottom: 8 }}>AT SIGNING</div>
                <div className="display" style={{ fontSize: 28, color: 'var(--ink-mid)', lineHeight: 1 }}>
                  {fmtListeners(c.baseline_listeners)}
                </div>
              </div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 12, textAlign: 'center' }}>→</div>
              <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-panel)', border: '1px solid var(--line)' }}>
                <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginBottom: 8 }}>NOW</div>
                <div className="display" style={{
                  fontSize: 28, lineHeight: 1,
                  color: nowListeners == null ? 'var(--ink-mid)'
                    : listenerDelta != null && listenerDelta > 0 ? 'var(--lime)' : 'var(--rose)',
                }}>
                  {fmtListeners(nowListeners)}
                </div>
                {listenerGrowthPct != null && (
                  <div className="tag" style={{
                    color: listenerGrowthPct >= 0 ? 'var(--lime)' : 'var(--rose)',
                    fontSize: 9, marginTop: 4,
                  }}>
                    {listenerGrowthPct >= 0 ? '+' : ''}{listenerGrowthPct.toFixed(0)}%
                  </div>
                )}
              </div>
            </div>

            {/* Royalties / Dev / P&L */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--bg-panel)', border: '1px solid var(--line)' }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROYALTIES EARNED</span>
                <span className="tag" style={{ color: 'var(--lime)', fontSize: 9 }}>+{fmtUSD(c.royalties_earned)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--bg-panel)', border: '1px solid var(--line)' }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNING BONUS</span>
                <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>−{fmtUSD(c.signing_bonus)}</span>
              </div>
              {c.dev_spend_total > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--bg-panel)', border: '1px solid var(--line)' }}>
                  <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>DEV SPEND</span>
                  <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>−{fmtUSD(c.dev_spend_total)}</span>
                </div>
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px',
                background: netPnl >= 0 ? 'rgba(200,255,58,0.06)' : 'rgba(255,70,70,0.06)',
                border: `1px solid ${netPnl >= 0 ? 'var(--lime)' : 'var(--rose)'}`,
              }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>NET P&amp;L</span>
                <span className="display" style={{
                  color: netPnl >= 0 ? 'var(--lime)' : 'var(--rose)',
                  fontSize: 24, lineHeight: 1,
                }}>
                  {netPnl >= 0 ? '+' : ''}{fmtUSD(netPnl)}
                </span>
              </div>
            </div>

            <button onClick={() => setStep(2)} style={{
              width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10,
              padding: '13px', border: '2px solid var(--line)', color: 'var(--ink-hi)',
              background: 'transparent', cursor: 'pointer', letterSpacing: 1,
            }}>YOUR CALL →</button>
          </div>
        )}

        {/* ── Step 2: Decision ── */}
        {step === 2 && (
          <div key="s2" className="ex-step">
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, letterSpacing: 2, marginBottom: 20 }}>
              YOUR CALL
            </div>
            <div className="display" style={{ fontSize: 36, color: 'var(--ink-hi)', lineHeight: 0.9, marginBottom: 10 }}>
              {c.artists.name}
            </div>
            <div style={{ color: 'var(--ink-low)', fontSize: 12, lineHeight: 1.6, marginBottom: 36 }}>
              {netPnl >= 0
                ? 'This deal was profitable. Worth another run?'
                : 'This deal ran a loss. Is there a path forward?'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { advanceOrClose(); router.push(`/artist/${c.artists.spotify_id}`) }}
                style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, padding: '14px',
                  border: '2px solid var(--lime)', color: 'var(--lime)',
                  background: 'rgba(200,255,58,0.08)', cursor: 'pointer', letterSpacing: 1,
                }}
              >
                RE-SIGN {c.artists.name.toUpperCase()} →
              </button>
              <button
                onClick={handleRelease}
                disabled={releasing}
                style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, padding: '14px',
                  border: '2px solid var(--rose)', color: 'var(--rose)',
                  background: 'rgba(255,70,70,0.06)', cursor: releasing ? 'not-allowed' : 'pointer',
                  letterSpacing: 1, opacity: releasing ? 0.5 : 1,
                }}
              >
                {releasing ? 'RELEASING...' : 'RELEASE'}
              </button>
              <button
                onClick={advanceOrClose}
                style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
                  border: '1px solid var(--line)', color: 'var(--ink-low)',
                  background: 'transparent', cursor: 'pointer', letterSpacing: 1,
                }}
              >
                DECIDE LATER
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
