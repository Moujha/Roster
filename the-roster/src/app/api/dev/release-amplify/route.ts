import { createClient } from '@/lib/supabase/server'
import { RELEASE_PEAKS, RELEASE_COST_MULT, computeWeeklyRoyalties, DEV_BUDGET_PCT } from '@/lib/royalty'

type SpendTier = 'light' | 'standard' | 'heavy'
const VALID_TIERS: SpendTier[] = ['light', 'standard', 'heavy']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { contract_id, spend_tier } = body

  if (!VALID_TIERS.includes(spend_tier))
    return Response.json({ error: 'spend_tier must be light, standard, or heavy' }, { status: 400 })

  // Verify contract belongs to label and is active
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, artist_id, status, rev_split_label_pct, artists(name)')
    .eq('id', contract_id)
    .eq('label_id', user.id)
    .single()

  if (!contract) return Response.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status !== 'active') return Response.json({ error: 'Contract is not active' }, { status: 409 })

  // Check no active release amplification
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase
    .from('release_amplifications')
    .select('id')
    .eq('contract_id', contract_id)
    .gte('expires_at', today)
    .limit(1)
    .maybeSingle()

  if (existing) return Response.json({ error: 'Release boost already active for this contract' }, { status: 409 })

  // Get latest monthly listeners to estimate dev budget
  const { data: statsRow } = await supabase
    .from('artist_stats_daily')
    .select('monthly_listeners')
    .eq('artist_id', contract.artist_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const monthlyListeners = statsRow?.monthly_listeners ?? 0
  const estWeeklyIncome = computeWeeklyRoyalties(monthlyListeners, contract.rev_split_label_pct, null)
  const devBudget = estWeeklyIncome * DEV_BUDGET_PCT
  const cost = Math.round(devBudget * RELEASE_COST_MULT[spend_tier as SpendTier] * 100) / 100

  // Check treasury
  const { data: label } = await supabase
    .from('labels')
    .select('treasury')
    .eq('id', user.id)
    .single()

  if (!label || label.treasury < cost)
    return Response.json({ error: 'Insufficient treasury', required: cost }, { status: 402 })

  const expiresAt = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
  const peakMultiplier = RELEASE_PEAKS[spend_tier as SpendTier]

  // Insert release amplification first
  const { data: amp, error: insertErr } = await supabase
    .from('release_amplifications')
    .insert({
      label_id: user.id,
      contract_id,
      artist_id: contract.artist_id,
      spend_tier,
      peak_multiplier: peakMultiplier,
      cost,
      triggered_at: today,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (insertErr) return Response.json({ error: insertErr.message }, { status: 500 })

  // Deduct treasury
  const { error: treasuryErr } = await supabase
    .from('labels')
    .update({ treasury: label.treasury - cost })
    .eq('id', user.id)

  if (treasuryErr) {
    await supabase.from('release_amplifications').delete().eq('id', amp.id)
    return Response.json({ error: 'Treasury update failed — boost rolled back' }, { status: 500 })
  }

  const artistName = (contract.artists as unknown as { name: string } | null)?.name ?? 'Unknown'
  await supabase.from('label_events').insert({
    label_id: user.id,
    event_type: 'release_boost',
    artist_name: artistName,
    payload: { spend_tier, cost, peak_multiplier: peakMultiplier, expires_at: expiresAt },
  })

  return Response.json(amp, { status: 201 })
}
