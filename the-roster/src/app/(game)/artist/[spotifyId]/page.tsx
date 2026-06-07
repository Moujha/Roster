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

  const [statsRes, sparkRes, countRes, labelRes, scoutRes, stats14Res, activeScoutCountRes] = await Promise.all([
    supabase.from('artist_stats_daily').select('*').eq('artist_id', artist.id)
      .order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('artist_stats_daily').select('date, daily_streams_top10')
      .eq('artist_id', artist.id).order('date', { ascending: false }).limit(7),
    supabase.from('contracts').select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id).eq('status', 'active'),
    supabase.from('labels').select('treasury, id').eq('id', user.id).single(),
    supabase.from('scouts').select('*')
      .eq('label_id', user.id).eq('artist_id', artist.id).maybeSingle(),
    supabase.from('artist_stats_daily').select('daily_streams_top10')
      .eq('artist_id', artist.id).order('date', { ascending: false }).limit(14),
    supabase.from('scouts').select('*', { count: 'exact', head: true })
      .eq('label_id', user.id).is('completed_at', null),
  ])

  const stats = statsRes.data as ArtistStats | null
  const statsForClient = stats && artist.tier === 'underground'
    ? { ...stats, momentum_score: null }
    : stats

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
      label={labelRes.data as Label}
      rosterCount={activeContractsRes.data?.length ?? 0}
      scout={scout}
      activeScoutCount={activeScoutCount}
      scoutReport={scoutReport}
      spotifyData={spotifyData as SpotifyEnrichment | null}
    />
  )
}
