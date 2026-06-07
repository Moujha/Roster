export async function getSpotifyToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    next: { revalidate: 3500 }, // cache token for just under its 3600s TTL
  })
  if (!res.ok) throw new Error(`Spotify auth error: ${res.status}`)
  const data = await res.json()
  return data.access_token as string
}

export type SpotifyRelease = {
  name: string
  album_type: string  // 'album' | 'single' | 'compilation'
  release_date: string
  total_tracks: number
  image_url: string | null
  spotify_url: string
}

export type SpotifyEnrichment = {
  image_url: string | null  // artist photo (640×640)
  image_url_sm: string | null  // 160×160 thumbnail
  spotify_url: string
  releases: SpotifyRelease[]  // up to 5 most recent
}

export async function fetchSpotifyArtistData(spotifyId: string): Promise<SpotifyEnrichment | null> {
  if (spotifyId.startsWith('test_')) return null

  try {
    const token = await getSpotifyToken()
    const headers = { Authorization: `Bearer ${token}` }
    const opts = { headers, next: { revalidate: 3600 } }

    const [artistRes, albumsRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/artists/${spotifyId}`, opts),
      fetch(
        `https://api.spotify.com/v1/artists/${spotifyId}/albums?include_groups=album,single&limit=5&market=US`,
        opts,
      ),
    ])

    if (!artistRes.ok) return null
    const artist = await artistRes.json()
    const albums = albumsRes.ok ? await albumsRes.json() : { items: [] }

    // Spotify returns images sorted largest → smallest
    const imgs: { url: string; height: number }[] = artist.images ?? []

    return {
      image_url:    imgs[0]?.url ?? null,
      image_url_sm: imgs[imgs.length - 1]?.url ?? imgs[0]?.url ?? null,
      spotify_url:  artist.external_urls?.spotify ?? `https://open.spotify.com/artist/${spotifyId}`,
      releases: (albums.items ?? []).slice(0, 5).map((a: Record<string, unknown>) => {
        const albumImgs = (a.images as { url: string }[] | undefined) ?? []
        const extUrls = (a.external_urls as Record<string, string> | undefined) ?? {}
        return {
          name:        a.name as string,
          album_type:  a.album_type as string,
          release_date: a.release_date as string,
          total_tracks: a.total_tracks as number,
          image_url:   albumImgs[0]?.url ?? null,
          spotify_url: extUrls.spotify ?? '',
        }
      }),
    }
  } catch {
    return null
  }
}
