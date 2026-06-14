import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import ArtistProfileClient from './client'
import type { Artist, ArtistStats, Label, Scout, Tier } from '@/lib/types'
import { classifyPattern, estimateBonus, momentumConfidence } from '@/lib/scout-helpers'
import { negotiationHint } from '@/lib/negotiation'
import { fetchSpotifyArtistData } from '@/lib/spotify'
import type { SpotifyEnrichment } from '@/lib/spotify'

export default async function ArtistProfilePage({
  params,
}: {
  params: Promise<{ spotifyId: string }>
}) {
  const { spotifyId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: artist } = await supabase
    .from('artists').select('*').eq('spotify_id', spotifyId).single()
  if (!artist) notFound()

  // GDD §3.4: all players see data 48 hours old
  const lagDate = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10)

  const [statsRes, sparkRes, countRes, labelRes, scoutRes, stats14Res, activeScoutCountRes, watchingRes, watchersRes, watcherCountRes] = await Promise.all([
    supabase.from('artist_stats_daily').select('*').eq('artist_id', artist.id)
      .lte('date', lagDate).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('artist_stats_daily').select('date, daily_streams_top10')
      .eq('artist_id', artist.id).lte('date', lagDate).order('date', { ascending: false }).limit(7),
    supabase.from('contracts').select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id).eq('status', 'active'),
    supabase.from('labels').select('treasury, id, reputation').eq('id', user.id).single(),
    supabase.from('scouts').select('*')
      .eq('label_id', user.id).eq('artist_id', artist.id).maybeSingle(),
    supabase.from('artist_stats_daily').select('daily_streams_top10')
      .eq('artist_id', artist.id).lte('date', lagDate).order('date', { ascending: false }).limit(14),
    supabase.from('scouts').select('*', { count: 'exact', head: true })
      .eq('label_id', user.id).is('completed_at', null),
    supabase.from('watchlists').select('id').eq('label_id', user.id).eq('artist_id', artist.id).maybeSingle(),
    supabase.from('watchlists').select('label_id, added_at, labels(label_name)')
      .eq('artist_id', artist.id).order('added_at', { ascending: true }).limit(5),
    supabase.from('watchlists').select('*', { count: 'exact', head: true }).eq('artist_id', artist.id),
  ])

  const isWatching = !!watchingRes.data
  const watchersRaw = (watchersRes.data ?? []) as unknown as {
    label_id: string
    labels: { label_name: string } | { label_name: string }[] | null
  }[]
  const watchers = watchersRaw.map(w => {
    const labelsField = w.labels
    const labelName = Array.isArray(labelsField)
      ? (labelsField[0]?.label_name ?? 'Unknown')
      : (labelsField?.label_name ?? 'Unknown')
    return { labelId: w.label_id, labelName }
  })
  const watcherCount = watcherCountRes.count ?? 0

  const stats = statsRes.data as ArtistStats | null
  const label = labelRes.data
  const labelReputation = label?.reputation ?? 0
  const isEstablished = labelReputation >= 250
  const isVeteran = labelReputation >= 600

  const statsForClient = (() => {
    if (!stats) return null
    const withUnderground = artist.tier === 'underground' ? { ...stats, momentum_score: null } : stats
    if (!isEstablished) return { ...withUnderground, stream_velocity_7d: null, listener_growth_28d: null, catalog_depth_score: null }
    return withUnderground
  })()

  let competitorScoutCount = 0
  let genreTrend: { genreAvgVelocity: number; artistCount: number } | null = null
  let regionalBreakout = false

  if (isVeteran) {
    const { count } = await createServiceClient()
      .from('scouts')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id)
      .neq('label_id', user.id)
      .is('completed_at', null)
    competitorScoutCount = count ?? 0

    // Genre trend context and regional breakout signal (§9.6 Veteran unlocks)
    const statsDate = statsRes.data?.date
    if (statsDate) {
      const [genreArtistsRes, countryArtistsRes] = await Promise.all([
        artist.genre
          ? supabase.from('artists').select('id').ilike('genre', `%${artist.genre}%`).neq('id', artist.id).neq('tier', 'major')
          : Promise.resolve({ data: null }),
        artist.country
          ? supabase.from('artists').select('id').eq('country', artist.country).neq('id', artist.id).neq('tier', 'major')
          : Promise.resolve({ data: null }),
      ])

      const [genreStatsRes, countryStatsRes] = await Promise.all([
        genreArtistsRes.data?.length
          ? supabase.from('artist_stats_daily').select('stream_velocity_7d').eq('date', statsDate)
              .in('artist_id', genreArtistsRes.data.map((a: { id: string }) => a.id)).not('stream_velocity_7d', 'is', null)
          : Promise.resolve({ data: null }),
        countryArtistsRes.data?.length
          ? supabase.from('artist_stats_daily').select('stream_velocity_7d').eq('date', statsDate)
              .in('artist_id', countryArtistsRes.data.map((a: { id: string }) => a.id)).not('stream_velocity_7d', 'is', null)
          : Promise.resolve({ data: null }),
      ])

      if (genreStatsRes.data?.length) {
        const avg = genreStatsRes.data.reduce((s: number, r: { stream_velocity_7d: number | null }) => s + (r.stream_velocity_7d ?? 0), 0) / genreStatsRes.data.length
        genreTrend = { genreAvgVelocity: avg, artistCount: genreStatsRes.data.length }
      }

      const artistVelocity = stats?.stream_velocity_7d ?? null
      if (countryStatsRes.data?.length && artistVelocity !== null) {
        const countryAvg = countryStatsRes.data.reduce((s: number, r: { stream_velocity_7d: number | null }) => s + (r.stream_velocity_7d ?? 0), 0) / countryStatsRes.data.length
        regionalBreakout = artistVelocity > countryAvg + 15 && artistVelocity > 10
      }
    }
  }

  const scout = scoutRes.data as Scout | null
  const stats14 = (stats14Res.data ?? []) as { daily_streams_top10: number | null }[]
  const activeScoutCount = activeScoutCountRes.count ?? 0

  // Read hidden negotiation weights via service role for completed scout hint
  let negHint: string | null = null
  if (scout?.completed_at) {
    const { data: artistWeights } = await createServiceClient()
      .from('artists')
      .select('priority_money, priority_freedom, priority_commitment')
      .eq('id', artist.id)
      .single()
    if (artistWeights) {
      negHint = negotiationHint({
        money:      artistWeights.priority_money ?? 0.34,
        freedom:    artistWeights.priority_freedom ?? 0.33,
        commitment: artistWeights.priority_commitment ?? 0.33,
      })
    }
  }

  const scoutReport = scout?.completed_at && stats
    ? {
        pattern: classifyPattern(stats14),
        bonusEstimate: estimateBonus(artist.tier as Tier, stats.monthly_listeners ?? 0),
        momentum: momentumConfidence(stats.listener_growth_28d ?? null),
        negotiationHint: negHint,
      }
    : null

  const [activeContractsRes, spotifyData] = await Promise.all([
    supabase.from('contracts').select('id', { count: 'exact', head: false })
      .eq('label_id', user.id).eq('status', 'active'),
    fetchSpotifyArtistData(spotifyId),
  ])

  return (
    <ArtistProfileClient
      artist={artist as Artist}
      stats={statsForClient}
      spark={sparkRes.data ?? []}
      signedByCount={countRes.count ?? 0}
      undergroundSignal={artist.tier === 'underground'}
      label={label as Label}
      rosterCount={activeContractsRes.data?.length ?? 0}
      scout={scout}
      activeScoutCount={activeScoutCount}
      scoutReport={scoutReport}
      spotifyData={spotifyData as SpotifyEnrichment | null}
      isWatching={isWatching}
      watchers={watchers}
      watcherCount={watcherCount}
      labelReputation={labelReputation}
      competitorScoutCount={competitorScoutCount}
      genreTrend={genreTrend}
      regionalBreakout={regionalBreakout}
    />
  )
}
