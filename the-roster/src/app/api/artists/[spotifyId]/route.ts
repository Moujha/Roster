import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ spotifyId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { spotifyId } = await params

  const { data: artist, error: aErr } = await supabase
    .from('artists')
    .select('*')
    .eq('spotify_id', spotifyId)
    .single()

  if (aErr || !artist) return Response.json({ error: 'Not found' }, { status: 404 })

  const [statsRes, sparkRes, countRes] = await Promise.all([
    supabase.from('artist_stats_daily').select('*').eq('artist_id', artist.id)
      .order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('artist_stats_daily').select('date, daily_streams_top10')
      .eq('artist_id', artist.id).order('date', { ascending: false }).limit(7),
    supabase.from('contracts').select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id).eq('status', 'active'),
  ])

  const stats = statsRes.data ? { ...statsRes.data } : null

  if (stats && artist.tier === 'underground') {
    delete (stats as Record<string, unknown>).momentum_score
    return Response.json({
      artist, stats, spark: sparkRes.data ?? [],
      signedByCount: countRes.count ?? 0,
      underground_signal: true,
    })
  }

  return Response.json({
    artist, stats, spark: sparkRes.data ?? [],
    signedByCount: countRes.count ?? 0,
  })
}
