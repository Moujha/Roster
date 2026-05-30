import { createClient } from '@/lib/supabase/server'
import type { LabelHistory, Tier } from '@/lib/types'

const TIER_COLORS: Record<Tier, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)', major: 'var(--rose)',
}
function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('label_history')
    .select('*')
    .eq('label_id', user.id)
    .order('completed_at', { ascending: false })

  const history = (data ?? []) as LabelHistory[]

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 4 }}>LABEL HISTORY</div>
      <div className="display" style={{ fontSize: 32, color: 'var(--ink-hi)', marginBottom: 24 }}>ALL CONTRACTS</div>

      {history.length === 0 ? (
        <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>No completed contracts yet.</div>
      ) : (
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 120px 100px 110px 100px 80px',
            gap: 10, padding: '8px 16px', borderBottom: '2px solid var(--line)',
          }}>
            {['ARTIST', 'TIER', 'DATES', 'ROYALTIES', 'SIGNING COST', 'NET P&L', 'REASON'].map(h => (
              <span key={h} className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{h}</span>
            ))}
          </div>
          {history.map(h => {
            const tc = TIER_COLORS[h.artist_tier as Tier] ?? 'var(--ink-mid)'
            return (
              <div key={h.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 120px 100px 110px 100px 80px',
                gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center',
              }}>
                <span style={{ color: 'var(--ink-hi)', fontSize: 13 }}>{h.artist_name}</span>
                <span className="tag" style={{ color: tc, border: `1px solid ${tc}`, padding: '1px 4px', fontSize: 8 }}>
                  {h.artist_tier.toUpperCase()}
                </span>
                <span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 8 }}>
                  {fmtDate(h.completed_at)}
                </span>
                <span className="tag" style={{ color: 'var(--lime)', fontSize: 10 }}>{fmtUSD(h.total_royalties)}</span>
                <span className="tag" style={{ color: 'var(--amber)', fontSize: 10 }}>{fmtUSD(h.signing_bonus)}</span>
                <span className="tag" style={{ color: h.net_pnl >= 0 ? 'var(--lime)' : 'var(--rose)', fontSize: 10 }}>
                  {h.net_pnl >= 0 ? '+' : ''}{fmtUSD(h.net_pnl)}
                </span>
                <span className="tag" style={{ color: h.reason === 'dropped' ? 'var(--rose)' : 'var(--ink-mid)', fontSize: 8 }}>
                  {h.reason.toUpperCase()}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
