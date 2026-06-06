import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .eq('label_id', user.id)
    .single()

  if (!contract) return Response.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status !== 'active')
    return Response.json({ error: 'Can only drop active contracts' }, { status: 400 })

  // Compute buyout penalty
  const weeksRemaining = Math.max(
    0,
    Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (7 * 86400_000))
  )
  const weeksElapsed = Math.max(
    1,
    Math.ceil((Date.now() - new Date(contract.start_date).getTime()) / (7 * 86400_000))
  )
  const weeklyEst = contract.royalties_earned / weeksElapsed
  const penalty = Math.round(weeksRemaining * weeklyEst * 0.5 * 100) / 100

  // Check treasury covers penalty
  const { data: label } = await supabase
    .from('labels')
    .select('treasury')
    .eq('id', user.id)
    .single()

  if (!label || label.treasury < penalty)
    return Response.json({ error: 'Insufficient treasury for buyout penalty', penalty }, { status: 409 })

  // Fetch artist + latest stats for history row
  const { data: artist } = await supabase
    .from('artists')
    .select('name, tier')
    .eq('id', contract.artist_id)
    .single()

  const { data: latestStats } = await supabase
    .from('artist_stats_daily')
    .select('monthly_listeners')
    .eq('artist_id', contract.artist_id)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  const netPnl = contract.royalties_earned - contract.signing_bonus - contract.dev_spend_total

  const { error: dropErr } = await supabase.from('contracts').update({ status: 'dropped' }).eq('id', id)
  if (dropErr) return Response.json({ error: dropErr.message }, { status: 500 })

  const { error: treasuryErr } = await supabase.from('labels')
    .update({ treasury: label.treasury - penalty }).eq('id', user.id)
  if (treasuryErr) return Response.json({ error: treasuryErr.message }, { status: 500 })

  const { error: histErr } = await supabase.from('label_history').insert({
    label_id: user.id,
    contract_id: id,
    artist_name: artist?.name ?? '',
    artist_tier: artist?.tier ?? '',
    listeners_at_signing: contract.baseline_listeners,
    listeners_at_end: latestStats?.monthly_listeners ?? null,
    signing_bonus: contract.signing_bonus,
    total_royalties: contract.royalties_earned,
    total_dev_spend: contract.dev_spend_total,
    net_pnl: netPnl,
    reason: 'dropped',
    completed_at: today,
  })
  if (histErr) return Response.json({ error: histErr.message }, { status: 500 })

  await supabase.from('label_events').insert({
    label_id: user.id,
    event_type: 'contract_expired',
    artist_name: artist?.name ?? '',
    payload: {
      net_pnl: netPnl - penalty,
      total_royalties: contract.royalties_earned,
      signing_bonus: contract.signing_bonus,
      reason: 'dropped',
    },
  })

  return Response.json({ ok: true, penalty })
}
