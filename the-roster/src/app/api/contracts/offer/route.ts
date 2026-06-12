import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { computeOfferScore, generateCounter, repNegParams } from '@/lib/negotiation'
import type { PriorityWeights, ContractOffer } from '@/lib/negotiation'

const BONUS_RANGES: Record<string, [number, number]> = {
  underground: [500, 2_000],
  emerging:    [5_000, 20_000],
  rising:      [20_000, 80_000],
  established: [80_000, 300_000],
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    artist_id,
    bonus,
    rev_split_label_pct,
    term_months,
    negotiation_id,
    accept_counter,
  } = body

  if (!artist_id) return Response.json({ error: 'artist_id required' }, { status: 400 })
  if (![3, 6, 12].includes(term_months))
    return Response.json({ error: 'term_months must be 3, 6, or 12' }, { status: 400 })
  if (rev_split_label_pct < 20 || rev_split_label_pct > 40)
    return Response.json({ error: 'rev_split_label_pct must be 20–40' }, { status: 400 })
  if (typeof bonus !== 'number' || bonus <= 0)
    return Response.json({ error: 'bonus must be a positive number' }, { status: 400 })

  // Roster cap
  const { count: activeCount } = await supabase
    .from('contracts').select('*', { count: 'exact', head: true })
    .eq('label_id', user.id).eq('status', 'active')
  if ((activeCount ?? 0) >= 5)
    return Response.json({ error: 'Roster full — maximum 5 active contracts' }, { status: 409 })

  // Duplicate contract
  const { count: dupCount } = await supabase
    .from('contracts').select('*', { count: 'exact', head: true })
    .eq('label_id', user.id).eq('artist_id', artist_id).eq('status', 'active')
  if ((dupCount ?? 0) > 0)
    return Response.json({ error: 'You already have an active contract with this artist' }, { status: 409 })

  // Treasury
  const { data: label } = await supabase
    .from('labels').select('treasury, reputation').eq('id', user.id).single()
  if (!label || label.treasury < bonus)
    return Response.json({ error: 'Insufficient treasury' }, { status: 402 })

  // Fetch artist with hidden negotiation fields via service role
  const service = createServiceClient()
  const { data: artist } = await service
    .from('artists')
    .select('id, tier, name, priority_money, priority_freedom, priority_commitment, negotiation_target')
    .eq('id', artist_id)
    .single()
  if (!artist) return Response.json({ error: 'Artist not found' }, { status: 404 })
  if (artist.tier === 'major')
    return Response.json({ error: 'Major artists are not signable' }, { status: 400 })

  const range = BONUS_RANGES[artist.tier]
  if (range && (bonus < range[0] || bonus > range[1]))
    return Response.json({
      error: `Signing bonus out of range for ${artist.tier} ($${range[0].toLocaleString()}–$${range[1].toLocaleString()})`,
    }, { status: 400 })

  // Cooling-off check
  const today = new Date().toISOString().slice(0, 10)
  const { data: cooling } = await supabase
    .from('negotiations')
    .select('cooling_off_until')
    .eq('label_id', user.id).eq('artist_id', artist_id).eq('status', 'cooling_off')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (cooling?.cooling_off_until && cooling.cooling_off_until >= today)
    return Response.json({
      error: `Deal unavailable — cooling off until ${cooling.cooling_off_until}`,
      cooling_off_until: cooling.cooling_off_until,
    }, { status: 409 })

  // Check for prior completed contract with this artist (re-sign detection)
  const { count: priorCount } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true })
    .eq('label_id', user.id)
    .eq('artist_id', artist_id)
    .in('status', ['expired', 'dropped'])
  const isResign = (priorCount ?? 0) > 0

  // Validate negotiation round context
  let round = 1
  if (negotiation_id) {
    const { data: existingNeg } = await supabase
      .from('negotiations').select('*').eq('id', negotiation_id).eq('label_id', user.id).single()
    if (!existingNeg) return Response.json({ error: 'Negotiation not found' }, { status: 404 })
    if (existingNeg.status !== 'countered')
      return Response.json({ error: 'No pending counter on this negotiation' }, { status: 409 })
    round = 2
  }

  const offer: ContractOffer = { bonus, rev_split_label_pct, term_months }
  const weights: PriorityWeights = {
    money:      artist.priority_money ?? 0.34,
    freedom:    artist.priority_freedom ?? 0.33,
    commitment: artist.priority_commitment ?? 0.33,
  }
  const target = artist.negotiation_target ?? 65
  const { targetModifier, counterWindow } = repNegParams(label.reputation ?? 0)
  const effectiveTarget = target + targetModifier

  // Fast-path: accept_counter=true means player accepted the counter's terms directly
  const score = accept_counter
    ? effectiveTarget          // counter was computed to hit target
    : computeOfferScore(offer, weights, artist.tier)

  // --- ACCEPT ---
  if (score >= effectiveTarget) {
    const contract = await createContract(supabase, user.id, label.treasury, label.reputation ?? 0, artist, offer, isResign)
    if (!contract) return Response.json({ error: 'Contract creation failed' }, { status: 500 })
    if (negotiation_id) {
      await supabase.from('negotiations')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', negotiation_id)
    }
    return Response.json({ outcome: 'accepted', contract }, { status: 201 })
  }

  // --- REJECT (below floor OR round 2 failure) ---
  if (score < effectiveTarget - counterWindow || round === 2) {
    const coolingUntil = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
    if (negotiation_id) {
      await supabase.from('negotiations')
        .update({ status: 'cooling_off', cooling_off_until: coolingUntil, updated_at: new Date().toISOString() })
        .eq('id', negotiation_id)
    } else {
      await supabase.from('negotiations').insert({
        label_id: user.id, artist_id, round, status: 'cooling_off', offer, cooling_off_until: coolingUntil,
      })
    }
    return Response.json({ outcome: 'rejected', cooling_off_until: coolingUntil }, { status: 200 })
  }

  // --- COUNTER ---
  const counter = generateCounter(offer, weights, artist.tier)
  let negId: string = negotiation_id

  if (negotiation_id) {
    await supabase.from('negotiations')
      .update({ round, offer, counter_offer: counter, updated_at: new Date().toISOString() })
      .eq('id', negotiation_id)
  } else {
    const { data: neg } = await supabase.from('negotiations').insert({
      label_id: user.id, artist_id, round, status: 'countered', offer, counter_offer: counter,
    }).select('id').single()
    negId = neg?.id ?? ''
  }

  return Response.json({ outcome: 'countered', counter, negotiation_id: negId }, { status: 200 })
}

async function createContract(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  labelId: string,
  currentTreasury: number,
  currentReputation: number,
  artist: { id: string; tier: string; name: string },
  offer: ContractOffer,
  isResign: boolean,
) {
  const today = new Date().toISOString().slice(0, 10)
  const endDate = new Date(Date.now() + offer.term_months * 30 * 86400_000).toISOString().slice(0, 10)

  const { data: latestStats } = await supabase
    .from('artist_stats_daily').select('monthly_listeners, listener_growth_28d')
    .eq('artist_id', artist.id).order('date', { ascending: false }).limit(1).maybeSingle()

  const { data: contract, error } = await supabase.from('contracts').insert({
    label_id: labelId,
    artist_id: artist.id,
    signing_bonus: offer.bonus,
    rev_split_label_pct: offer.rev_split_label_pct,
    term_months: offer.term_months,
    start_date: today,
    end_date: endDate,
    baseline_listeners: latestStats?.monthly_listeners ?? null,
    baseline_growth_pct: latestStats?.listener_growth_28d ?? null,
  }).select().single()

  if (error || !contract) return null

  await Promise.all([
    supabase.from('labels').update({ treasury: currentTreasury - offer.bonus }).eq('id', labelId),
    supabase.from('label_events').insert({
      label_id: labelId,
      event_type: 'artist_signed',
      artist_name: artist.name,
      payload: { months: offer.term_months, split_pct: offer.rev_split_label_pct, signing_bonus: offer.bonus },
    }),
  ])

  if (isResign) {
    await supabase.from('labels')
      .update({ reputation: Math.min(1000, currentReputation + 10) })
      .eq('id', labelId)
  }

  return contract
}
