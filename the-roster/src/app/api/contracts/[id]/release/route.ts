import { createClient } from '@/lib/supabase/server'

export async function POST(
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
  if (contract.status !== 'expired')
    return Response.json({ error: 'Can only release expired contracts' }, { status: 400 })

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

  await supabase.from('label_history').insert({
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
    reason: 'natural',
    completed_at: today,
  })

  return Response.json({ ok: true })
}
