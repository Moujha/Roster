import { createClient } from '@/lib/supabase/server'
import { SideNav } from './nav'

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: label }, { count: royaltyCount }] = user ? await Promise.all([
    supabase.from('labels').select('label_name, reputation').eq('id', user.id).single(),
    supabase.from('label_events').select('*', { count: 'exact', head: true })
      .eq('label_id', user.id).eq('event_type', 'royalty_paid'),
  ]) : [{ data: null }, { count: 0 }]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SideNav
        labelName={label?.label_name ?? ''}
        reputation={label?.reputation ?? 0}
        leaderboardUnlocked={(royaltyCount ?? 0) > 0}
      />
      <main style={{ minWidth: 0, overflow: 'auto' }}>{children}</main>
    </div>
  )
}
