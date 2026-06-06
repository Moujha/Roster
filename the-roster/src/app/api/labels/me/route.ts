import { createClient } from '@/lib/supabase/server'

export async function GET(_request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Label not found' }, { status: 404 })
  return Response.json(data)
}

const ALLOWED_PATCH_FIELDS = ['genre_1', 'genre_2', 'country', 'label_name'] as const
type PatchField = (typeof ALLOWED_PATCH_FIELDS)[number]

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Whitelist: only accept known fields
  const update: Partial<Record<PatchField, string>> = {}
  for (const field of ALLOWED_PATCH_FIELDS) {
    if (field in body) {
      update[field] = body[field]
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('labels')
    .update(update)
    .eq('id', user.id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
