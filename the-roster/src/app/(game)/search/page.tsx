import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import SearchBar from './search-bar'
import type { Artist } from '@/lib/types'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function ArtistCard({ artist, metric }: {
  artist: Artist
  metric?: { label: string; value: string; color: string }
}) {
  return (
    <Link href={`/artist/${artist.spotify_id}`} style={{
      display: 'block', background: 'var(--bg-panel)', border: '2px solid var(--line)',
      padding: 14, textDecoration: 'none', color: 'inherit',
    }}>
      <div className="display" style={{ fontSize: 18, color: 'var(--ink-hi)', lineHeight: 1 }}>{artist.name}</div>
      <div style={{ marginTop: 6 }}>
        <span className="tag" style={{
          color: TIER_COLORS[artist.tier] ?? 'var(--ink-mid)', fontSize: 8,
          border: `1px solid ${TIER_COLORS[artist.tier] ?? 'var(--line)'}`, padding: '1px 4px',
        }}>{artist.tier.toUpperCase()}</span>
        {artist.genre && (
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginLeft: 6 }}>
            {artist.genre.toUpperCase().slice(0, 16)}
          </span>
        )}
      </div>
      {metric && (
        <div className="tag" style={{ color: metric.color, fontSize: 9, marginTop: 8 }}>
          {metric.label}: {metric.value}
        </div>
      )}
    </Link>
  )
}

async function getOnRamps(userId: string) {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: label } = await supabase.from('labels').select('genre_1, genre_2, country').eq('id', userId).single()

  // Breaking: top 5 by velocity today
  const { data: bStats } = await supabase.from('artist_stats_daily')
    .select('artist_id, stream_velocity_7d').eq('date', today)
    .not('stream_velocity_7d', 'is', null).order('stream_velocity_7d', { ascending: false }).limit(5)
  const bIds = (bStats ?? []).map(s => s.artist_id)
  const breakingMap = Object.fromEntries((bStats ?? []).map(s => [s.artist_id, s.stream_velocity_7d]))
  const { data: breakingArtists } = bIds.length
    ? await supabase.from('artists').select('*').in('id', bIds)
    : { data: [] as Artist[] }

  // Genre picks: top 3 by momentum for label genres
  let genreArtists: Artist[] = []
  let genreMetrics: Record<string, number> = {}
  if (label?.genre_1) {
    const genres = [label.genre_1, label.genre_2].filter(Boolean) as string[]
    const orFilter = genres.map(g => `genre.ilike.%${g}%`).join(',')
    const { data: gArtists } = await supabase.from('artists').select('id').or(orFilter)
    if (gArtists?.length) {
      const { data: gStats } = await supabase.from('artist_stats_daily')
        .select('artist_id, momentum_score').eq('date', today)
        .in('artist_id', gArtists.map(a => a.id))
        .not('momentum_score', 'is', null).order('momentum_score', { ascending: false }).limit(3)
      if (gStats?.length) {
        genreMetrics = Object.fromEntries(gStats.map(s => [s.artist_id, s.momentum_score]))
        const { data: ga } = await supabase.from('artists').select('*').in('id', gStats.map(s => s.artist_id))
        genreArtists = (ga ?? []) as Artist[]
      }
    }
  }

  // Regional: top 5 by velocity in same country
  let regionalArtists: Artist[] = []
  let regionalMetrics: Record<string, number> = {}
  if (label?.country) {
    const { data: rArtists } = await supabase.from('artists').select('id').eq('country', label.country)
    if (rArtists?.length) {
      const { data: rStats } = await supabase.from('artist_stats_daily')
        .select('artist_id, stream_velocity_7d').eq('date', today)
        .in('artist_id', rArtists.map(a => a.id))
        .not('stream_velocity_7d', 'is', null).order('stream_velocity_7d', { ascending: false }).limit(5)
      if (rStats?.length) {
        regionalMetrics = Object.fromEntries(rStats.map(s => [s.artist_id, s.stream_velocity_7d]))
        const { data: ra } = await supabase.from('artists').select('*').in('id', rStats.map(s => s.artist_id))
        regionalArtists = (ra ?? []) as Artist[]
      }
    }
  }

  return { label, breakingArtists: (breakingArtists ?? []) as Artist[], breakingMap, genreArtists, genreMetrics, regionalArtists, regionalMetrics }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { q } = await searchParams

  let searchResults: Artist[] = []
  if (q && q.length >= 2) {
    const { data } = await supabase.from('artists').select('*').ilike('name', `%${q}%`).neq('tier', 'major').limit(20)
    searchResults = (data ?? []) as Artist[]
  }

  const onRamps = !q ? await getOnRamps(user!.id) : null

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 8 }}>FIND ARTISTS</div>
      <div style={{ marginBottom: 24 }}>
        <SearchBar initial={q ?? ''} />
      </div>

      {q && (
        <div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 12 }}>
            {searchResults.length} RESULTS FOR &quot;{q.toUpperCase()}&quot;
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {searchResults.map(a => <ArtistCard key={a.id} artist={a} />)}
          </div>
          {searchResults.length === 0 && (
            <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>No artists found</div>
          )}
        </div>
      )}

      {!q && onRamps && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {onRamps.breakingArtists.length > 0 && (
            <section>
              <div className="tag" style={{ color: 'var(--lime)', fontSize: 10, marginBottom: 12 }}>BREAKING THIS WEEK</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.breakingArtists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: 'VELOCITY',
                    value: `+${(onRamps.breakingMap[a.id] ?? 0).toFixed(1)}%`,
                    color: 'var(--lime)',
                  }} />
                ))}
              </div>
            </section>
          )}
          {onRamps.genreArtists.length > 0 && (
            <section>
              <div className="tag" style={{ color: 'var(--cyan)', fontSize: 10, marginBottom: 12 }}>YOUR GENRE PICKS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.genreArtists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: 'SCORE',
                    value: `${(onRamps.genreMetrics[a.id] ?? 0).toFixed(0)}`,
                    color: 'var(--cyan)',
                  }} />
                ))}
              </div>
            </section>
          )}
          {onRamps.regionalArtists.length > 0 && (
            <section>
              <div className="tag" style={{ color: 'var(--amber)', fontSize: 10, marginBottom: 12 }}>TRENDING IN YOUR REGION</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.regionalArtists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: 'VELOCITY',
                    value: `+${(onRamps.regionalMetrics[a.id] ?? 0).toFixed(1)}%`,
                    color: 'var(--amber)',
                  }} />
                ))}
              </div>
            </section>
          )}
          {!onRamps.breakingArtists.length && !onRamps.genreArtists.length && !onRamps.regionalArtists.length && (
            <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>
              No on-ramp data yet -- the pipeline runs daily at 07:00 UTC.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
