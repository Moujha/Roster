import { createClient } from '@/lib/supabase/server'
import { SideNav } from './nav'

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: label } = user
    ? await supabase.from('labels').select('label_name, reputation').eq('id', user.id).single()
    : { data: null }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SideNav
        labelName={label?.label_name ?? ''}
        reputation={label?.reputation ?? 0}
      />
      <main style={{ minWidth: 0, overflow: 'auto' }}>{children}</main>
    </div>
  )
}
