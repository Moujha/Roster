import { createClient } from '@/lib/supabase/server'
import { scoutDurationWeeks } from '@/lib/scout-helpers'
import type { Tier } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('scouts')
    .select('*, artists(name)')
    .eq('label_id', user.id)
    .order('completes_at', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ scouts: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { artist_id } = body
  if (!artist_id) return Response.json({ error: 'artist_id required' }, { status: 400 })

  // 1. Check active scout count < 8
  const { count: activeCount } = await supabase
    .from('scouts')
    .select('*', { count: 'exact', head: true })
    .eq('label_id', user.id)
    .is('completed_at', null)
  if ((activeCount ?? 0) >= 8)
    return Response.json({ error: 'Maximum 8 active scouts' }, { status: 409 })

  // 2. No existing scout for this label+artist
  const { data: existing } = await supabase
    .from('scouts')
    .select('id')
    .eq('label_id', user.id)
    .eq('artist_id', artist_id)
    .maybeSingle()
  if (existing)
    return Response.json({ error: 'Already scouting this artist' }, { status: 409 })

  // 3. Artist exists and tier is not major
  const { data: artist } = await supabase
    .from('artists')
    .select('id, tier, country, genre')
    .eq('id', artist_id)
    .single()
  if (!artist) return Response.json({ error: 'Artist not found' }, { status: 404 })
  if (artist.tier === 'major')
    return Response.json({ error: 'Cannot scout major artists' }, { status: 400 })

  // 4. Compute affinity
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
      (artist.country && a.country === artist.country) ||
      (artist.genre && a.genre === artist.genre),
    )
  }

  const durationWeeks = scoutDurationWeeks(artist.tier as Tier, false, hasAffinity)
  const today = new Date().toISOString().slice(0, 10)
  const completesAt = new Date(
    Date.now() + durationWeeks * 7 * 86400_000,
  ).toISOString().slice(0, 10)

  const { data: scout, error: insertErr } = await supabase
    .from('scouts')
    .insert({
      label_id: user.id,
      artist_id,
      started_at: today,
      completes_at: completesAt,
      is_discovery: false,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })
  return Response.json(scout, { status: 201 })
}
