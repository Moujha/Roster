'use client'

import { useState } from 'react'
import Link from 'next/link'

export type LeaderboardRow = {
  label_id: string
  label_name: string
  reputation: number
  revenue_90d: number
  emerging_rev: number
  efficiency: number
  avg_growth_pct: number
}

type TabId = 'revenue_90d' | 'emerging_rev' | 'efficiency' | 'avg_growth_pct'

const TABS: { id: TabId; label: string; desc: string; fmt: (n: number) => string; emptyLabel: string }[] = [
  {
    id: 'revenue_90d',
    label: '90D REVENUE',
    desc: 'Rolling 90-day royalties earned',
    fmt: (n) => fmtUSD(n),
    emptyLabel: '$0',
  },
  {
    id: 'emerging_rev',
    label: 'EMERGING',
    desc: 'Revenue from artists signed with under 1M listeners',
    fmt: (n) => fmtUSD(n),
    emptyLabel: '$0',
  },
  {
    id: 'efficiency',
    label: 'EFFICIENCY',
    desc: 'Revenue per dollar invested (signing + dev spend)',
    fmt: (n) => n > 0 ? `${n.toFixed(2)}×` : '—',
    emptyLabel: '—',
  },
  {
    id: 'avg_growth_pct',
    label: 'TALENT SCOUT',
    desc: 'Avg listener growth % across completed contracts',
    fmt: (n) => n > 0 ? `+${n.toFixed(0)}%` : '—',
    emptyLabel: '—',
  },
]

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function repTier(rep: number) {
  if (rep < 250) return { label: 'NEW',         color: 'var(--ink-mid)' }
  if (rep < 600) return { label: 'ESTABLISHED', color: 'var(--cyan)' }
  return              { label: 'VETERAN',       color: 'var(--amber)' }
}

const RANK_COLORS = ['var(--amber)', 'var(--ink-mid)', 'var(--violet)']

interface Props {
  rows: LeaderboardRow[]
  myLabelId: string
}

export function LeaderboardClient({ rows, myLabelId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('revenue_90d')
  const tab = TABS.find(t => t.id === activeTab)!

  const sorted = [...rows].sort((a, b) => (b[activeTab] as number) - (a[activeTab] as number))
  const myRank = sorted.findIndex(r => r.label_id === myLabelId) + 1
  const showAll = sorted.length <= 15
  const displayed = showAll ? sorted : sorted.slice(0, 10)
  const myRow = sorted.find(r => r.label_id === myLabelId)
  const myInTop = myRank <= 10

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--line)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9,
              padding: '8px 16px', cursor: 'pointer', border: 'none',
              borderBottom: activeTab === t.id ? '2px solid var(--lime)' : '2px solid transparent',
              marginBottom: -2,
              color: activeTab === t.id ? 'var(--lime)' : 'var(--ink-low)',
              background: 'transparent', letterSpacing: 1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 16 }}>
        {tab.desc}
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 36px 1fr 100px 100px',
        gap: 8, padding: '6px 12px',
        borderBottom: '2px solid var(--line)',
      }}>
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>RANK</span>
        <span />
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>LABEL</span>
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, textAlign: 'right' }}>
          {tab.label}
        </span>
        <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, textAlign: 'right' }}>REP</span>
      </div>

      {/* Rows */}
      {displayed.map((row, idx) => {
        const rank = idx + 1
        const isMe = row.label_id === myLabelId
        const tier = repTier(row.reputation)
        const initials = row.label_name.slice(0, 2).toUpperCase() || 'LB'
        const value = row[activeTab] as number

        return (
          <div
            key={row.label_id}
            style={{
              display: 'grid', gridTemplateColumns: '40px 36px 1fr 100px 100px',
              gap: 8, padding: '10px 12px',
              borderBottom: '1px solid var(--line-soft)',
              background: isMe ? 'rgba(200,255,58,0.04)' : 'transparent',
              borderLeft: isMe ? '3px solid var(--lime)' : '3px solid transparent',
              alignItems: 'center',
            }}
          >
            {/* Rank */}
            <div className="tag" style={{
              fontSize: rank <= 3 ? 16 : 12,
              color: rank <= 3 ? RANK_COLORS[rank - 1] : 'var(--ink-low)',
              fontFamily: 'Silkscreen, monospace',
            }}>
              {rank <= 3 ? ['①', '②', '③'][rank - 1] : `#${rank}`}
            </div>

            {/* Avatar */}
            <div style={{
              width: 28, height: 28,
              background: tier.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Inter, sans-serif', color: '#100719', fontSize: 9, fontWeight: 800,
            }}>
              {initials}
            </div>

            {/* Name */}
            <div>
              <div style={{ color: isMe ? 'var(--lime)' : 'var(--ink-hi)', fontSize: 13 }}>
                <Link href={`/labels/${row.label_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {row.label_name}
                </Link>
                {isMe && <span className="tag" style={{ color: 'var(--lime)', fontSize: 8, marginLeft: 8, border: '1px solid var(--lime)', padding: '1px 4px' }}>YOU</span>}
              </div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 1 }}>
                {row.reputation} PTS
              </div>
            </div>

            {/* Metric value */}
            <div style={{ textAlign: 'right' }}>
              <span className="tag" style={{
                color: value > 0 ? 'var(--ink-hi)' : 'var(--ink-low)',
                fontSize: 13,
              }}>
                {tab.fmt(value)}
              </span>
            </div>

            {/* Rep tier */}
            <div style={{ textAlign: 'right' }}>
              <span className="tag" style={{ color: tier.color, fontSize: 9 }}>{tier.label}</span>
            </div>
          </div>
        )
      })}

      {/* "Your position" when outside top 10 */}
      {!myInTop && myRow && (
        <>
          <div style={{ padding: '6px 12px', color: 'var(--ink-low)', fontSize: 11, textAlign: 'center' }}>
            · · ·
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 36px 1fr 100px 100px',
            gap: 8, padding: '10px 12px',
            borderBottom: '1px solid var(--line-soft)',
            background: 'rgba(200,255,58,0.04)',
            borderLeft: '3px solid var(--lime)',
            alignItems: 'center',
          }}>
            <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 12 }}>#{myRank}</div>
            <div style={{
              width: 28, height: 28,
              background: repTier(myRow.reputation).color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Inter, sans-serif', color: '#100719', fontSize: 9, fontWeight: 800,
            }}>
              {myRow.label_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ color: 'var(--lime)', fontSize: 13 }}>
                <Link href={`/labels/${myRow.label_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {myRow.label_name}
                </Link>
                <span className="tag" style={{ color: 'var(--lime)', fontSize: 8, marginLeft: 8, border: '1px solid var(--lime)', padding: '1px 4px' }}>YOU</span>
              </div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 1 }}>{myRow.reputation} PTS</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="tag" style={{ color: 'var(--ink-hi)', fontSize: 13 }}>{tab.fmt(myRow[activeTab] as number)}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="tag" style={{ color: repTier(myRow.reputation).color, fontSize: 9 }}>{repTier(myRow.reputation).label}</span>
            </div>
          </div>
        </>
      )}

      {rows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mid)', fontSize: 13 }}>
          No labels on the board yet.{' '}
          <Link href="/search" style={{ color: 'var(--lime)' }}>Sign an artist</Link> to get started.
        </div>
      )}
    </div>
  )
}
