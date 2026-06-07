import { createClient } from '@/lib/supabase/server'
import { LeaderboardClient } from './client'
import type { LeaderboardRow } from './client'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('get_leaderboard')

  const rows = (error ? [] : (data ?? [])) as LeaderboardRow[]

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 900 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>GLOBAL RANKINGS</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 4 }}>LEADERBOARD</div>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 24 }}>
        {rows.length} LABEL{rows.length !== 1 ? 'S' : ''} · ROLLING 90-DAY WINDOW · UPDATES DAILY
      </div>

      <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: '16px 0 0' }}>
        <LeaderboardClient rows={rows} myLabelId={user.id} />
      </div>
    </div>
  )
}
