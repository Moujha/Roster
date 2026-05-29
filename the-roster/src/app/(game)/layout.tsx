'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { icon: '◼', label: 'LABEL HQ',  href: '/dashboard' },
  { icon: '◆', label: 'SEARCH',    href: '/search' },
  { icon: '$', label: 'CONTRACTS', href: '/contracts' },
  { icon: '◉', label: 'HISTORY',   href: '/history' },
]

function SideItem({ icon, label, href }: { icon: string; label: string; href: string }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      background: active ? 'var(--bg-elev)' : 'transparent',
      borderLeft: active ? '4px solid var(--lime)' : '4px solid transparent',
      color: active ? 'var(--ink-hi)' : 'var(--ink-mid)',
      textDecoration: 'none',
      fontSize: 12, letterSpacing: '1px',
      fontFamily: 'var(--font-mono, Silkscreen)',
      textTransform: 'uppercase',
      transition: 'background 0.1s',
    }}>
      <span style={{
        width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--lime)' : 'var(--bg-tile)',
        color: active ? '#100719' : 'var(--ink-mid)',
        fontSize: 11, fontFamily: 'Silkscreen, monospace',
      }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
    </Link>
  )
}

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <aside style={{
        background: 'var(--bg-panel)',
        borderRight: '2px solid var(--line)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 14px', borderBottom: '2px solid var(--line)' }}>
          <div className="display" style={{ fontSize: 28, color: 'var(--lime)', lineHeight: 0.9 }}>THE ROSTER</div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 4 }}>SEASON 01 · WEEK 01</div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px 0', flex: 1 }}>
          {NAV_ITEMS.map(item => <SideItem key={item.href} {...item}/>)}
        </nav>

        {/* User */}
        <div style={{ padding: 12, borderTop: '2px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, background: 'var(--lime)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Silkscreen, monospace', color: '#100719', fontSize: 14, fontWeight: 700,
          }}>YOU</div>
          <div style={{ minWidth: 0 }}>
            <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10 }}>@YOU</div>
            <div className="tag" style={{ color: 'var(--lime)', fontSize: 9 }}>SEED LABEL · LV 1</div>
          </div>
        </div>
      </aside>

      <main style={{ minWidth: 0, overflow: 'auto' }}>{children}</main>
    </div>
  )
}
