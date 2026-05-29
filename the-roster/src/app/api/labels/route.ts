import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { label_name } = body ?? {}
  if (!label_name?.trim()) {
    return Response.json({ error: 'label_name required' }, { status: 400 })
  }

  // Idempotency check: one label per user
  const { data: existing } = await supabase
    .from('labels')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (existing) {
    return Response.json({ error: 'Label already exists' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('labels')
    .insert({ id: user.id, label_name: label_name.trim() })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
