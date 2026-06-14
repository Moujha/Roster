import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ labelId: string }> }
) {
  const supabase = createServiceClient()
  const { labelId } = await params

  const { data: label } = await supabase
    .from('labels')
    .select('id, label_name, reputation')
    .eq('id', labelId)
    .maybeSingle()

  if (!label) return Response.json({ error: 'Label not found' }, { status: 404 })

  const { data: entries } = await supabase
    .from('watchlists')
    .select('id, added_at, artist_id, artists(id, name, tier, spotify_id)')
    .eq('label_id', labelId)
    .order('added_at', { ascending: false })

  const artistIds = (entries as { artist_id: string }[] ?? []).map((e: { artist_id: string }) => e.artist_id)

  const statsMap = new Map<string, { monthly_listeners: number | null; momentum_score: number | null; spark: (number | null)[] }>()

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

  const watchlist = (entries as unknown as { id: string; added_at: string; artist_id: string; artists: { id: string; name: string; tier: string; spotify_id: string } | null }[] ?? []).map((e: {
    id: string; added_at: string; artist_id: string;
    artists: { id: string; name: string; tier: string; spotify_id: string } | null
  }) => {
    const raw = statsMap.get(e.artist_id) ?? null
    const isUnderground = e.artists?.tier === 'underground'
    const stats = raw ? { ...raw, momentum_score: isUnderground ? null : raw.momentum_score } : null
    return { id: e.id, added_at: e.added_at, artist: e.artists ?? null, stats }
  })

  return Response.json({ label, watchlist })
}
