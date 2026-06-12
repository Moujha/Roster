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

  // The weekly cron already archived this contract to label_history when it expired it.
  // Just dismiss it from the expired list by changing the status.
  const { error: updateErr } = await supabase
    .from('contracts').update({ status: 'dropped' }).eq('id', id)
  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 })

  return Response.json({ ok: true })
}
