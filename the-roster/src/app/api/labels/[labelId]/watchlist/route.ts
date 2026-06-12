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

  const artistIds = (entries ?? []).map((e: any) => e.artist_id)

  let statsMap: Map<string, { monthly_listeners: number | null; momentum_score: number | null; spark: (number | null)[] }> = new Map()

  if (artistIds.length > 0) {
    const { data: statsRows } = await supabase
      .from('artist_stats_daily')
      .select('artist_id, date, daily_streams_top10, momentum_score, monthly_listeners')
      .in('artist_id', artistIds)
      .order('date', { ascending: false })
      .limit(artistIds.length * 8)

    const grouped = new Map<string, any[]>()
    for (const row of (statsRows ?? [])) {
      if (!grouped.has(row.artist_id)) grouped.set(row.artist_id, [])
      grouped.get(row.artist_id)!.push(row)
    }
    for (const [id, rows] of grouped) {
      if (!rows) continue
      const top7 = rows.slice(0, 7)
      statsMap.set(id, {
        monthly_listeners: top7[0]?.monthly_listeners ?? null,
        momentum_score: top7[0]?.momentum_score ?? null,
        spark: [...top7].reverse().map(r => r.daily_streams_top10 ?? null),
      })
    }
  }

  const watchlist = (entries ?? []).map((e: any) => ({
    id: e.id,
    added_at: e.added_at,
    artist: e.artists && Array.isArray(e.artists) && e.artists.length > 0 ? e.artists[0] : null,
    stats: statsMap.get(e.artist_id) ?? null,
  }))

  return Response.json({ label, watchlist })
}
