import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { artist_id } = body
  if (!artist_id) return Response.json({ error: 'artist_id required' }, { status: 400 })

  const { data: artist } = await supabase
    .from('artists').select('id').eq('id', artist_id).maybeSingle()
  if (!artist) return Response.json({ error: 'Artist not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('watchlists')
    .upsert({ label_id: user.id, artist_id }, { onConflict: 'label_id,artist_id', ignoreDuplicates: true })
    .select('added_at')
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, added_at: data?.added_at ?? new Date().toISOString() })
}
