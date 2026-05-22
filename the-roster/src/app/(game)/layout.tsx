import Link from 'next/link'

export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-[#0a0a0a]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/market" className="font-mono font-bold tracking-[0.2em] text-amber-400 text-sm">
            THE ROSTER
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/market" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Market
            </Link>
            <Link href="/portfolio" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Portfolio
            </Link>
            <Link href="/league" className="text-sm text-zinc-400 hover:text-white transition-colors">
              League
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
