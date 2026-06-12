import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: latestRow }, { data: label }] = await Promise.all([
    supabase.from('artist_stats_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('labels').select('genre_1, genre_2, country').eq('id', user.id).single(),
  ])
  const statsDate = latestRow?.date
  if (!statsDate) return Response.json({ breaking: [], breakingVelocityMap: {}, genrePicks: [], genreScoreMap: {}, regional: [], regionalVelocityMap: {} })

  // Breaking: top 5 by stream_velocity_7d on latest available stats date
  const { data: bStats } = await supabase
    .from('artist_stats_daily')
    .select('artist_id, stream_velocity_7d')
    .eq('date', statsDate)
    .not('stream_velocity_7d', 'is', null)
    .order('stream_velocity_7d', { ascending: false })
    .limit(5)

  const bIds = (bStats ?? []).map(s => s.artist_id)
  const breakingVelocityMap = Object.fromEntries(
    (bStats ?? []).map(s => [s.artist_id, s.stream_velocity_7d])
  )
  const { data: breakingArtists } = bIds.length
    ? await supabase.from('artists').select('*').in('id', bIds)
    : { data: [] }

  // Genre picks: top 3 by momentum_score for label genres
  let genreArtists: unknown[] = []
  let genreScoreMap: Record<string, number> = {}
  if (label?.genre_1) {
    const genres = [label.genre_1, label.genre_2].filter(Boolean) as string[]
    const orFilter = genres.map(g => `genre.ilike.%${g}%`).join(',')
    const { data: gArtists } = await supabase
      .from('artists')
      .select('id')
      .or(orFilter)
    if (gArtists?.length) {
      const { data: gStats } = await supabase
        .from('artist_stats_daily')
        .select('artist_id, momentum_score')
        .eq('date', statsDate)
        .in('artist_id', gArtists.map(a => a.id))
        .not('momentum_score', 'is', null)
        .order('momentum_score', { ascending: false })
        .limit(3)
      if (gStats?.length) {
        genreScoreMap = Object.fromEntries(gStats.map(s => [s.artist_id, s.momentum_score]))
        const { data: ga } = await supabase
          .from('artists')
          .select('*')
          .in('id', gStats.map(s => s.artist_id))
        genreArtists = ga ?? []
      }
    }
  }

  // Regional: top 5 by stream_velocity_7d in same country
  let regionalArtists: unknown[] = []
  let regionalVelocityMap: Record<string, number> = {}
  if (label?.country) {
    const { data: rArtists } = await supabase
      .from('artists')
      .select('id')
      .eq('country', label.country)
    if (rArtists?.length) {
      const { data: rStats } = await supabase
        .from('artist_stats_daily')
        .select('artist_id, stream_velocity_7d')
        .eq('date', statsDate)
        .in('artist_id', rArtists.map(a => a.id))
        .not('stream_velocity_7d', 'is', null)
        .order('stream_velocity_7d', { ascending: false })
        .limit(5)
      if (rStats?.length) {
        regionalVelocityMap = Object.fromEntries(rStats.map(s => [s.artist_id, s.stream_velocity_7d]))
        const { data: ra } = await supabase
          .from('artists')
          .select('*')
          .in('id', rStats.map(s => s.artist_id))
        regionalArtists = ra ?? []
      }
    }
  }

  return Response.json({
    breaking: breakingArtists ?? [],
    breakingVelocityMap,
    genrePicks: genreArtists,
    genreScoreMap,
    regional: regionalArtists,
    regionalVelocityMap,
  })
}
