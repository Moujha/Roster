import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return Response.json({ artists: [] })

  const { data, error } = await supabase
    .from('artists')
    .select('id, spotify_id, name, genre, country, tier')
    .ilike('name', `%${q}%`)
    .neq('tier', 'major')
    .limit(20)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ artists: data ?? [] })
}
