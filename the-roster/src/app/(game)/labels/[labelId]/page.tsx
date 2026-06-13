import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fmtRelativeTime } from '@/lib/utils'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function fmtListeners(n: number | null) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function repTier(rep: number) {
  if (rep < 250) return { label: 'NEW LABEL',   color: 'var(--ink-mid)' }
  if (rep < 600) return { label: 'ESTABLISHED', color: 'var(--cyan)' }
  return              { label: 'VETERAN',       color: 'var(--amber)' }
}

export default async function PublicLabelPage({
  params,
}: {
  params: Promise<{ labelId: string }>
}) {
  const { labelId } = await params
  const supabase = createServiceClient()

  const { data: label } = await supabase
    .from('labels')
    .select('id, label_name, reputation')
    .eq('id', labelId)
    .maybeSingle()

  if (!label) notFound()

  const { data: entries } = await supabase
    .from('watchlists')
    .select('id, added_at, artist_id, artists(id, name, tier, spotify_id)')
    .eq('label_id', labelId)
    .order('added_at', { ascending: false })

  const artistIds = (entries ?? []).map((e: { artist_id: string }) => e.artist_id)
  const statsMap = new Map<string, {
    monthly_listeners: number | null
    momentum_score: number | null
    spark: (number | null)[]
  }>()

  if (artistIds.length > 0) {
    const lagDate = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10)
    const { data: statsRows } = await supabase
      .from('artist_stats_daily')
      .select('artist_id, date, daily_streams_top10, momentum_score, monthly_listeners')
      .in('artist_id', artistIds)
      .lte('date', lagDate)
      .order('date', { ascending: false })
      .limit(artistIds.length * 8)

    const grouped = new Map<string, { artist_id: string; date: string; daily_streams_top10: number | null; momentum_score: number | null; monthly_listeners: number | null }[]>()
    for (const row of (statsRows ?? [])) {
      if (!grouped.has(row.artist_id)) grouped.set(row.artist_id, [])
      grouped.get(row.artist_id)!.push(row)
    }
    for (const [id, rows] of grouped) {
      const top7 = rows.slice(0, 7)
      statsMap.set(id, {
        monthly_listeners: top7[0]?.monthly_listeners ?? null,
        momentum_score: top7[0]?.momentum_score ?? null,
        spark: [...top7].reverse().map(r => r.daily_streams_top10 ?? null),
      })
    }
  }

  const rows = (entries ?? []) as unknown as {
    id: string; added_at: string; artist_id: string;
    artists: { id: string; name: string; tier: string; spotify_id: string } | null
  }[]

  const tier = repTier(label.reputation)

  return (
    <div style={{ padding: 24, maxWidth: 760, fontFamily: 'Inter, sans-serif', color: 'var(--ink)' }}>
      {/* Label header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, background: tier.color, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Inter, sans-serif', color: '#100719', fontSize: 14, fontWeight: 800,
        }}>
          {label.label_name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="display" style={{ fontSize: 24, color: 'var(--ink-hi)' }}>{label.label_name}</div>
          <div className="tag" style={{ color: tier.color, fontSize: 9 }}>
            {tier.label} · {label.reputation} PTS
          </div>
        </div>
      </div>

      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 12 }}>WATCHLIST</div>

      {rows.length === 0 ? (
        <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>This label hasn&apos;t added any artists yet.</div>
      ) : (
        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
          {rows.map(entry => {
            const artist = entry.artists
            if (!artist) return null
            const s = statsMap.get(entry.artist_id)
            const tierColor = TIER_COLORS[artist.tier] ?? 'var(--ink-mid)'
            const validSpark = s?.spark ?? []
            const maxSpark = Math.max(...validSpark.filter((v): v is number => v != null), 1)
            const isUnderground = artist.tier === 'underground'

            return (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderBottom: '1px solid var(--line-soft)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/artist/${artist.spotify_id}`} style={{ color: 'var(--ink-hi)', fontSize: 13, textDecoration: 'none' }}>
                    {artist.name}
                  </Link>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                    <span className="tag" style={{ color: tierColor, fontSize: 8 }}>{artist.tier.toUpperCase()}</span>
                    <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{fmtListeners(s?.monthly_listeners ?? null)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 20, flexShrink: 0 }}>
                  {validSpark.length > 0
                    ? validSpark.map((v, i) => {
                        const h = v != null ? Math.max(2, Math.round((v / maxSpark) * 20)) : 2
                        return <div key={i} style={{ width: 5, height: h, background: v != null ? 'var(--lime)' : 'var(--bg-tile)', flexShrink: 0 }} />
                      })
                    : Array.from({ length: 7 }, (_, i) => (
                        <div key={i} style={{ width: 5, height: 2, background: 'var(--bg-tile)' }} />
                      ))
                  }
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 48 }}>
                  {!isUnderground && s?.momentum_score != null
                    ? <div className="tag" style={{ color: 'var(--lime)', fontSize: 12 }}>{Math.round(s.momentum_score)}</div>
                    : <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 12 }}>—</div>
                  }
                  <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginTop: 2 }}>
                    {fmtRelativeTime(entry.added_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
