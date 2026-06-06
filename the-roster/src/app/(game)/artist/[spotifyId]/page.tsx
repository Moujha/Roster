import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ArtistProfileClient from './client'
import type { Artist, ArtistStats, Label } from '@/lib/types'

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

  const [statsRes, sparkRes, countRes, labelRes] = await Promise.all([
    supabase.from('artist_stats_daily').select('*').eq('artist_id', artist.id)
      .order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('artist_stats_daily').select('date, daily_streams_top10')
      .eq('artist_id', artist.id).order('date', { ascending: false }).limit(7),
    supabase.from('contracts').select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id).eq('status', 'active'),
    supabase.from('labels').select('treasury, id').eq('id', user.id).single(),
  ])

  const stats = statsRes.data as ArtistStats | null
  const statsForClient = stats && artist.tier === 'underground'
    ? { ...stats, momentum_score: null }
    : stats

  const { data: activeContracts } = await supabase
    .from('contracts').select('id', { count: 'exact', head: false })
    .eq('label_id', user.id).eq('status', 'active')

  return (
    <ArtistProfileClient
      artist={artist as Artist}
      stats={statsForClient}
      spark={sparkRes.data ?? []}
      signedByCount={countRes.count ?? 0}
      undergroundSignal={artist.tier === 'underground'}
      label={labelRes.data as Label}
      rosterCount={activeContracts?.length ?? 0}
    />
  )
}
