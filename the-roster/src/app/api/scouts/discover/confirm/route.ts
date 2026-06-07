import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { scoutDurationWeeks } from '@/lib/scout-helpers'
import { getSpotifyToken } from '@/lib/spotify'
import type { Tier } from '@/lib/types'

function popularityToTier(popularity: number): Tier {
  if (popularity <= 29) return 'underground'
  if (popularity <= 54) return 'emerging'
  if (popularity <= 74) return 'rising'
  return 'established'
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { spotify_id } = body
  if (!spotify_id) return Response.json({ error: 'spotify_id required' }, { status: 400 })

  // Check 8-slot limit early — before any DB writes
  const { count: activeCount } = await supabase
    .from('scouts')
    .select('*', { count: 'exact', head: true })
    .eq('label_id', user.id)
    .is('completed_at', null)
  if ((activeCount ?? 0) >= 8)
    return Response.json({ error: 'Maximum 8 active scouts' }, { status: 409 })

  // Resolve or create artist
  const { data: existingArtist } = await supabase
    .from('artists')
    .select('id, tier, country, genre')
    .eq('spotify_id', spotify_id)
    .maybeSingle()

  let artistId: string
  let isDiscovery: boolean
  let artistTier: Tier
  let artistCountry: string | null
  let artistGenre: string | null

  if (existingArtist) {
    if (existingArtist.tier === 'major')
      return Response.json({ error: 'Cannot scout major artists' }, { status: 400 })
    // Check duplicate for existing artists (new artists can't have a duplicate)
    const { data: existingScout } = await supabase
      .from('scouts')
      .select('id')
      .eq('label_id', user.id)
      .eq('artist_id', existingArtist.id)
      .maybeSingle()
    if (existingScout)
      return Response.json({ error: 'Already scouting this artist' }, { status: 409 })

    artistId = existingArtist.id
    artistTier = existingArtist.tier as Tier
    artistCountry = existingArtist.country
    artistGenre = existingArtist.genre
    isDiscovery = false
  } else {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET)
      return Response.json({ error: 'Spotify not configured' }, { status: 503 })

    let token: string
    try {
      token = await getSpotifyToken()
    } catch {
      return Response.json({ error: 'Spotify auth failed' }, { status: 502 })
    }

    const spotifyRes = await fetch(`https://api.spotify.com/v1/artists/${spotify_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!spotifyRes.ok)
      return Response.json({ error: 'Spotify artist fetch failed' }, { status: 502 })

    const spotifyArtist = await spotifyRes.json()
    const tier = popularityToTier(spotifyArtist.popularity ?? 0)
    const genre = (spotifyArtist.genres?.[0] as string | undefined) ?? null

    const { data: newArtist, error: insertArtistErr } = await createServiceClient()
      .from('artists')
      .insert({ spotify_id, name: spotifyArtist.name, genre, country: null, tier })
      .select('id, tier, country, genre')
      .single()

    if (insertArtistErr)
      return Response.json({ error: insertArtistErr.message }, { status: 500 })

    artistId = newArtist.id
    artistTier = newArtist.tier as Tier
    artistCountry = null
    artistGenre = genre
    isDiscovery = true
  }

  // Compute affinity
  const { data: activeContracts } = await supabase
    .from('contracts')
    .select('artist_id')
    .eq('label_id', user.id)
    .eq('status', 'active')

  let hasAffinity = false
  if (activeContracts?.length) {
    const { data: rosterArtists } = await supabase
      .from('artists')
      .select('country, genre')
      .in('id', activeContracts.map(c => c.artist_id))
    hasAffinity = (rosterArtists ?? []).some(a =>
      (artistCountry && a.country === artistCountry) ||
      (artistGenre && a.genre === artistGenre),
    )
  }

  const durationWeeks = scoutDurationWeeks(artistTier, isDiscovery, hasAffinity)
  const today = new Date().toISOString().slice(0, 10)
  const completesAt = new Date(
    Date.now() + durationWeeks * 7 * 86400_000,
  ).toISOString().slice(0, 10)

  const { data: scout, error: insertErr } = await supabase
    .from('scouts')
    .insert({
      label_id: user.id,
      artist_id: artistId,
      started_at: today,
      completes_at: completesAt,
      is_discovery: isDiscovery,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  const { data: artist } = await supabase
    .from('artists')
    .select('id, spotify_id, name, tier, genre, country')
    .eq('id', artistId)
    .single()

  if (!artist) return Response.json({ error: 'Artist retrieval failed' }, { status: 500 })

  return Response.json({ scout, artist }, { status: 201 })
}
