import { createClient } from '@/lib/supabase/server'
import { getSpotifyToken } from '@/lib/spotify'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { query } = body
  if (!query?.trim()) return Response.json({ error: 'query required' }, { status: 400 })

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET)
    return Response.json({ error: 'Spotify not configured' }, { status: 503 })

  let token: string
  try {
    token = await getSpotifyToken()
  } catch {
    return Response.json({ error: 'Spotify auth failed' }, { status: 502 })
  }

  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=3`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return Response.json({ error: 'Spotify search failed' }, { status: 502 })

  const data = await res.json()
  const artists = (data.artists?.items ?? []).map((a: {
    id: string; name: string; followers?: { total: number }
  }) => ({
    spotify_id: a.id,
    name: a.name,
    followers: a.followers?.total ?? 0,
  }))

  return Response.json({ artists })
}
