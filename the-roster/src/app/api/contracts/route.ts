import { createClient } from '@/lib/supabase/server'

const BONUS_RANGES: Record<string, [number, number]> = {
  underground: [500, 2_000],
  emerging: [5_000, 20_000],
  rising: [20_000, 80_000],
  established: [80_000, 300_000],
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('contracts')
    .select('*, artists(name, tier, spotify_id)')
    .eq('label_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ contracts: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { artist_id, signing_bonus, rev_split_label_pct, term_months } = body

  // Validate inputs
  if (![3, 6, 12].includes(term_months))
    return Response.json({ error: 'term_months must be 3, 6, or 12' }, { status: 400 })
  if (rev_split_label_pct < 10 || rev_split_label_pct > 50)
    return Response.json({ error: 'rev_split_label_pct must be 10-50' }, { status: 400 })
  if (typeof signing_bonus !== 'number' || signing_bonus <= 0)
    return Response.json({ error: 'signing_bonus must be a positive number' }, { status: 400 })

  // Check active contract count < 5
  const { count: activeCount } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .eq('label_id', user.id)
    .eq('status', 'active')
  if ((activeCount ?? 0) >= 5)
    return Response.json({ error: 'Roster full - maximum 5 active contracts' }, { status: 409 })

  // Check treasury
  const { data: label } = await supabase
    .from('labels')
    .select('treasury')
    .eq('id', user.id)
    .single()
  if (!label || label.treasury < signing_bonus)
    return Response.json({ error: 'Insufficient treasury' }, { status: 402 })

  // Fetch artist, validate tier + bonus range
  const { data: artist } = await supabase
    .from('artists')
    .select('id, tier, name')
    .eq('id', artist_id)
    .single()
  if (!artist) return Response.json({ error: 'Artist not found' }, { status: 404 })
  if (artist.tier === 'major')
    return Response.json({ error: 'Major artists are not signable' }, { status: 400 })

  // Check for existing active contract with this artist
  const { count: existingCount } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .eq('label_id', user.id)
    .eq('artist_id', artist.id)
    .eq('status', 'active')

  if ((existingCount ?? 0) > 0) {
    return Response.json({ error: 'You already have an active contract with this artist' }, { status: 409 })
  }

  const range = BONUS_RANGES[artist.tier]
  if (range && (signing_bonus < range[0] || signing_bonus > range[1]))
    return Response.json({ error: `Signing bonus out of range for ${artist.tier} (${range[0]}-${range[1]})` }, { status: 400 })

  // Fetch latest stats for baseline
  const { data: latestStats } = await supabase
    .from('artist_stats_daily')
    .select('monthly_listeners, listener_growth_28d')
    .eq('artist_id', artist_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  const endDate = new Date(Date.now() + term_months * 30 * 86400 * 1000).toISOString().slice(0, 10)

  // Insert contract
  const { data: contract, error: insertErr } = await supabase
    .from('contracts')
    .insert({
      label_id: user.id,
      artist_id,
      signing_bonus,
      rev_split_label_pct,
      term_months,
      start_date: today,
      end_date: endDate,
      baseline_listeners: latestStats?.monthly_listeners ?? null,
      baseline_growth_pct: latestStats?.listener_growth_28d ?? null,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  // Deduct signing bonus from treasury
  const { error: treasuryErr } = await supabase
    .from('labels')
    .update({ treasury: label.treasury - signing_bonus })
    .eq('id', user.id)

  if (treasuryErr) {
    // Roll back contract
    await supabase.from('contracts').delete().eq('id', contract.id)
    return Response.json({ error: 'Treasury update failed - contract rolled back' }, { status: 500 })
  }

  await supabase.from('label_events').insert({
    label_id: user.id,
    event_type: 'artist_signed',
    artist_name: artist.name,
    payload: {
      months: term_months,
      split_pct: rev_split_label_pct,
      signing_bonus,
    },
  })

  return Response.json(contract, { status: 201 })
}
