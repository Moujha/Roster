'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { icon: '◼', label: 'LABEL HQ',    href: '/dashboard' },
  { icon: '◆', label: 'SEARCH',      href: '/search' },
  { icon: '$', label: 'CONTRACTS',   href: '/contracts' },
  { icon: '◉', label: 'HISTORY',     href: '/history' },
  { icon: '▲', label: 'LEADERBOARD', href: '/leaderboard' },
]

function repTier(rep: number) {
  if (rep < 250) return { label: 'NEW LABEL',   color: 'var(--ink-mid)' }
  if (rep < 600) return { label: 'ESTABLISHED', color: 'var(--cyan)' }
  return              { label: 'VETERAN',       color: 'var(--amber)' }
}

interface NavProps {
  labelName: string
  reputation: number
}

export function SideNav({ labelName, reputation }: NavProps) {
  const pathname = usePathname()
  const tier = repTier(reputation)
  const initial = labelName.slice(0, 2).toUpperCase() || 'LB'

  return (
    <aside style={{
      background: 'var(--bg-panel)', borderRight: '2px solid var(--line)',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 0, height: '100vh',
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 14px', borderBottom: '2px solid var(--line)' }}>
        <div className="display" style={{ fontSize: 28, color: 'var(--lime)', lineHeight: 0.9 }}>THE ROSTER</div>
        <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 4 }}>MUSIC LABEL SIMULATOR</div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '8px 0', flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              background: active ? 'var(--bg-elev)' : 'transparent',
              borderLeft: active ? '4px solid var(--lime)' : '4px solid transparent',
              color: active ? 'var(--ink-hi)' : 'var(--ink-mid)',
              textDecoration: 'none',
              fontSize: 11, letterSpacing: '0.5px',
              fontFamily: 'Inter, sans-serif', fontWeight: 600,
              textTransform: 'uppercase',
            }}>
              <span style={{
                width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'var(--lime)' : 'var(--bg-tile)',
                color: active ? '#100719' : 'var(--ink-mid)',
                fontSize: 11, fontFamily: 'Silkscreen, monospace',
              }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Label identity */}
      <div style={{ padding: 12, borderTop: '2px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, background: tier.color, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Inter, sans-serif', color: '#100719', fontSize: 11, fontWeight: 800,
        }}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {labelName || 'YOUR LABEL'}
          </div>
          <div className="tag" style={{ color: tier.color, fontSize: 8 }}>
            {tier.label} · {reputation} PTS
          </div>
        </div>
      </div>
    </aside>
  )
}
