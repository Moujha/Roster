import { createClient } from '@/lib/supabase/server'
import { DEV_COST_PCT, type DevTier } from '@/lib/royalty'

const VALID_TIERS: DevTier[] = ['none', 'light', 'standard', 'heavy']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { contract_id, playlist_tier, social_push_tier } = body

  if (!VALID_TIERS.includes(playlist_tier) || !VALID_TIERS.includes(social_push_tier))
    return Response.json({ error: 'Invalid tier' }, { status: 400 })

  if (DEV_COST_PCT[playlist_tier as DevTier] + DEV_COST_PCT[social_push_tier as DevTier] > 1.0)
    return Response.json({ error: 'Combined dev spend exceeds 100% of weekly budget' }, { status: 400 })

  // Verify contract belongs to label
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, status')
    .eq('id', contract_id)
    .eq('label_id', user.id)
    .single()

  if (!contract) return Response.json({ error: 'Contract not found' }, { status: 404 })
  if (contract.status !== 'active') return Response.json({ error: 'Contract is not active' }, { status: 409 })

  const { data, error } = await supabase
    .from('dev_allocations')
    .upsert({
      contract_id,
      playlist_tier,
      social_push_tier,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'contract_id' })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
