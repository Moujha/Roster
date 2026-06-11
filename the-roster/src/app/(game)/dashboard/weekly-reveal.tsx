'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { LabelEvent } from '@/lib/types'

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export default function WeeklyReveal({
  events,
  weekEnd,
}: {
  events: LabelEvent[]
  weekEnd: string  // ISO date of the Sunday this covers, e.g. "2026-06-08"
}) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (events.length === 0) return
    const key = `roster_weekly_reveal_${weekEnd}`
    if (!localStorage.getItem(key)) setVisible(true)
  }, [events.length, weekEnd])

  if (!visible) return null

  // Group by artist, sum amounts
  const byArtist = new Map<string, number>()
  for (const e of events) {
    const amount = (e.payload.amount as number) ?? 0
    byArtist.set(e.artist_name, (byArtist.get(e.artist_name) ?? 0) + amount)
  }
  const rows = [...byArtist.entries()].sort((a, b) => b[1] - a[1])
  const total = rows.reduce((sum, [, v]) => sum + v, 0)
  const weekLabel = new Date(weekEnd + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })

  function dismiss() {
    localStorage.setItem(`roster_weekly_reveal_${weekEnd}`, '1')
    setVisible(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, letterSpacing: 2, marginBottom: 20 }}>
          WEEK ENDING {weekLabel.toUpperCase()}
        </div>

        <div className="display" style={{ fontSize: 56, color: 'var(--lime)', lineHeight: 0.85, marginBottom: 6 }}>
          {fmtUSD(total)}
        </div>
        <div className="tag" style={{ color: 'var(--lime)', fontSize: 10, opacity: 0.6, marginBottom: 32 }}>
          TOTAL ROYALTIES
        </div>

        {/* Per-artist breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 36 }}>
          {rows.map(([name, amount]) => (
            <div key={name} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--bg-panel)', border: '1px solid var(--line)',
            }}>
              <span style={{ color: 'var(--ink-hi)', fontSize: 13 }}>{name}</span>
              <span className="tag" style={{ color: 'var(--lime)', fontSize: 11 }}>{fmtUSD(amount)}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => { dismiss(); router.push('/contracts') }}
          style={{
            width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 700,
            fontSize: 10, padding: '14px',
            border: '2px solid var(--lime)', color: 'var(--lime)',
            background: 'rgba(200,255,58,0.08)', cursor: 'pointer', letterSpacing: 1,
          }}
        >
          ALLOCATE NEXT WEEK&apos;S BUDGET →
        </button>

        <button
          onClick={dismiss}
          style={{
            display: 'block', margin: '14px auto 0',
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9,
            color: 'var(--ink-low)', background: 'transparent', border: 'none',
            cursor: 'pointer', letterSpacing: 1,
          }}
        >
          SKIP →
        </button>

      </div>
    </div>
  )
}
