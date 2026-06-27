'use client'

import { useState } from 'react'
import type { DevAllocation, ReleaseAmplification } from '@/lib/types'
import { PLAYLIST_MULTIPLIERS, SOCIAL_FLOOR_PCTS, DEV_COST_PCT, RELEASE_PEAKS, RELEASE_COST_MULT, type DevTier } from '@/lib/royalty'
import { InfoTip } from '@/components/info-tip'

type SpendTier = 'light' | 'standard' | 'heavy'

interface Props {
  contractId: string
  alloc: DevAllocation | null
  estWeeklyIncome: number
  activeRelease: ReleaseAmplification | null
}

const TIER_LABELS: Record<DevTier, string> = { none: 'NONE', light: 'LIGHT', standard: 'STD', heavy: 'HEAVY' }
const RELEASE_LABELS: Record<SpendTier, string> = { light: 'LIGHT', standard: 'STD', heavy: 'HEAVY' }

function fmtUSD(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function daysLeft(expiresAt: string) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400_000))
}

export function DevAllocPanel({ contractId, alloc, estWeeklyIncome, activeRelease }: Props) {
  const [open, setOpen] = useState(false)
  const [playlist, setPlaylist] = useState<DevTier>(alloc?.playlist_tier ?? 'none')
  const [social, setSocial] = useState<DevTier>(alloc?.social_push_tier ?? 'none')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [boosting, setBoosting] = useState(false)
  const [boostError, setBoostError] = useState<string | null>(null)

  const devBudget = estWeeklyIncome * 0.12
  const playlistCost = devBudget * DEV_COST_PCT[playlist]
  const socialCost = devBudget * DEV_COST_PCT[social]
  const totalCostPct = DEV_COST_PCT[playlist] + DEV_COST_PCT[social]
  const overBudget = totalCostPct > 1.0

  const playlistMult = PLAYLIST_MULTIPLIERS[playlist]
  const socialFloor = SOCIAL_FLOOR_PCTS[social]

  async function save() {
    if (overBudget) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/dev/allocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract_id: contractId, playlist_tier: playlist, social_push_tier: social }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Save failed')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function triggerBoost(tier: SpendTier) {
    setBoosting(true)
    setBoostError(null)
    const res = await fetch('/api/dev/release-amplify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract_id: contractId, spend_tier: tier }),
    })
    setBoosting(false)
    if (!res.ok) {
      const d = await res.json()
      setBoostError(d.error ?? 'Boost failed')
    } else {
      window.location.reload()
    }
  }

  const isMonday = new Date().getDay() === 1

  return (
    <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0',
        }}
      >
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>
          DEVELOP {open ? '▲' : '▼'}
        </span>
        {isMonday && playlist === 'none' && social === 'none' && (
          <span className="tag" style={{ color: 'var(--lime)', fontSize: 8, border: '1px solid rgba(200,255,58,0.35)', padding: '1px 6px', background: 'rgba(200,255,58,0.06)' }}>
            BUDGET AVAILABLE
          </span>
        )}
        {alloc && (alloc.playlist_tier !== 'none' || alloc.social_push_tier !== 'none') && (
          <span className="tag" style={{ color: 'var(--cyan)', fontSize: 9, background: 'rgba(0,200,220,0.08)', padding: '1px 5px', border: '1px solid var(--cyan)' }}>
            {alloc.playlist_tier !== 'none' ? `PL:${TIER_LABELS[alloc.playlist_tier]}` : ''}
            {alloc.playlist_tier !== 'none' && alloc.social_push_tier !== 'none' ? ' ' : ''}
            {alloc.social_push_tier !== 'none' ? `SP:${TIER_LABELS[alloc.social_push_tier]}` : ''}
          </span>
        )}
        {activeRelease && (
          <span className="tag" style={{ color: 'var(--amber)', fontSize: 9, background: 'rgba(250,180,0,0.08)', padding: '1px 5px', border: '1px solid var(--amber)' }}>
            BOOST {daysLeft(activeRelease.expires_at)}d LEFT
          </span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-soft)' }}>
          {/* Budget bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>
              WEEKLY DEV BUDGET ≈ {fmtUSD(devBudget)}
            </span>
            <span className="tag" style={{ color: overBudget ? 'var(--rose)' : 'var(--ink-mid)', fontSize: 9 }}>
              {Math.round(totalCostPct * 100)}% USED
              {overBudget && ' — OVER BUDGET'}
            </span>
          </div>
          <div style={{ height: 3, background: 'var(--line)', marginBottom: 14, borderRadius: 2 }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${Math.min(totalCostPct * 100, 100)}%`,
              background: overBudget ? 'var(--rose)' : 'var(--cyan)',
            }} />
          </div>

          {/* Playlist pitching */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>PLAYLIST PITCHING — stream volume boost</span>
              <InfoTip text="Boosts total stream volume for 7 days. Multiplier applies to your royalty calculation. Re-allocate each Monday to keep it active." />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['none', 'light', 'standard', 'heavy'] as DevTier[]).map(t => (
                <button
                  key={t}
                  onClick={() => setPlaylist(t)}
                  style={{
                    fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9,
                    padding: '4px 9px', cursor: 'pointer', border: '1px solid',
                    borderColor: playlist === t ? 'var(--cyan)' : 'var(--line)',
                    color: playlist === t ? 'var(--cyan)' : 'var(--ink-low)',
                    background: playlist === t ? 'rgba(0,200,220,0.08)' : 'transparent',
                  }}
                >
                  {TIER_LABELS[t]}
                  {t !== 'none' && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>
                      +{Math.round((PLAYLIST_MULTIPLIERS[t] - 1) * 100)}%
                      {' · '}
                      {fmtUSD(devBudget * DEV_COST_PCT[t])}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {playlist !== 'none' && (
              <div className="tag" style={{ color: 'var(--cyan)', fontSize: 8, marginTop: 4, opacity: 0.7 }}>
                {playlistMult.toFixed(2)}× stream volume · 7-day window · resets weekly
              </div>
            )}
          </div>

          {/* Social push */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>SOCIAL PUSH — velocity floor (defensive)</span>
              <InfoTip text="Sets a floor on how far streams can drop week-over-week. Doesn't boost revenue — it protects against decline. Use when momentum is at risk." />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['none', 'light', 'standard', 'heavy'] as DevTier[]).map(t => (
                <button
                  key={t}
                  onClick={() => setSocial(t)}
                  style={{
                    fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9,
                    padding: '4px 9px', cursor: 'pointer', border: '1px solid',
                    borderColor: social === t ? 'var(--lime)' : 'var(--line)',
                    color: social === t ? 'var(--lime)' : 'var(--ink-low)',
                    background: social === t ? 'rgba(130,230,80,0.08)' : 'transparent',
                  }}
                >
                  {TIER_LABELS[t]}
                  {t !== 'none' && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>
                      {t === 'heavy' ? '0% drop' : `-${Math.round((1 - SOCIAL_FLOOR_PCTS[t]) * 100)}% max`}
                      {' · '}
                      {fmtUSD(devBudget * DEV_COST_PCT[t])}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {social !== 'none' && (
              <div className="tag" style={{ color: 'var(--lime)', fontSize: 8, marginTop: 4, opacity: 0.7 }}>
                Streams floor at {Math.round(socialFloor * 100)}% of prior week · does not boost revenue
              </div>
            )}
          </div>

          {/* Cost summary */}
          {(playlist !== 'none' || social !== 'none') && (
            <div style={{ marginBottom: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>WEEKLY DEV SPEND</span>
                <span className="tag" style={{ color: overBudget ? 'var(--rose)' : 'var(--ink-hi)', fontSize: 9 }}>
                  {fmtUSD(playlistCost + socialCost)}
                  {' / '}
                  {fmtUSD(devBudget)}
                </span>
              </div>
            </div>
          )}

          {error && <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginBottom: 8 }}>{error}</div>}

          <button
            onClick={save}
            disabled={saving || overBudget}
            style={{
              fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9,
              padding: '6px 14px', cursor: overBudget ? 'not-allowed' : 'pointer',
              border: '1px solid',
              borderColor: overBudget ? 'var(--ink-low)' : 'var(--lime)',
              color: overBudget ? 'var(--ink-low)' : 'var(--lime)',
              background: saved ? 'rgba(130,230,80,0.12)' : 'transparent',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saved ? 'SAVED ✓' : saving ? 'SAVING...' : 'SAVE ALLOCATION'}
          </button>

          {/* Release amplification */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
              <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>RELEASE AMPLIFICATION — treasury spend · 14-day decay</span>
              <InfoTip text="One-time treasury spend when a new track drops. Peaks immediately and decays to 1× over 14 days. Stacks with playlist pitching up to the 1.60× hard cap." />
            </div>

            {activeRelease ? (
              <div style={{ padding: '8px 10px', background: 'rgba(250,180,0,0.06)', border: '1px solid var(--amber)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="tag" style={{ color: 'var(--amber)', fontSize: 9 }}>
                      ACTIVE — {activeRelease.spend_tier.toUpperCase()} {activeRelease.peak_multiplier.toFixed(2)}× PEAK
                    </span>
                    <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>
                      {daysLeft(activeRelease.expires_at)} days remaining · expires {activeRelease.expires_at}
                    </div>
                  </div>
                  <div style={{ height: 32, width: 80 }}>
                    <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      {[...Array(14)].map((_, i) => {
                        const d = daysLeft(activeRelease.expires_at)
                        const dayIdx = 14 - d + i
                        const frac = dayIdx < 14 ? 1 - dayIdx / 14 : 0
                        const active = dayIdx <= (14 - d)
                        return (
                          <div
                            key={i}
                            style={{
                              flex: 1, marginRight: 1,
                              height: `${Math.round(frac * 100)}%`,
                              background: active ? 'var(--amber)' : 'rgba(250,180,0,0.15)',
                              minHeight: 2,
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                {(['light', 'standard', 'heavy'] as SpendTier[]).map(t => {
                  const cost = devBudget * RELEASE_COST_MULT[t]
                  return (
                    <button
                      key={t}
                      onClick={() => triggerBoost(t)}
                      disabled={boosting}
                      style={{
                        fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9,
                        padding: '4px 9px', cursor: 'pointer', border: '1px solid var(--amber)',
                        color: 'var(--amber)', background: 'rgba(250,180,0,0.06)',
                        opacity: boosting ? 0.5 : 1,
                      }}
                    >
                      {RELEASE_LABELS[t]} {RELEASE_PEAKS[t].toFixed(2)}×
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>{fmtUSD(cost)}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {boostError && (
              <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginTop: 6 }}>{boostError}</div>
            )}
            {!activeRelease && (
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 6 }}>
                Cost deducted from treasury immediately · peaks at signing, decays to 1× over 14 days
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
