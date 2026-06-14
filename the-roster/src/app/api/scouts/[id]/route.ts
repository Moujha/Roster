import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: scout } = await supabase
    .from('scouts')
    .select('id, completed_at')
    .eq('id', id)
    .eq('label_id', user.id)
    .maybeSingle()

  if (!scout) return Response.json({ error: 'Scout not found' }, { status: 404 })
  if (scout.completed_at)
    return Response.json({ error: 'Cannot cancel a completed scout' }, { status: 409 })

  const { error } = await supabase.from('scouts').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
