import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import SearchBar from './search-bar'
import type { Artist } from '@/lib/types'

const TIER_COLORS: Record<string, string> = {
  underground: 'var(--violet)', emerging: 'var(--lime)',
  rising: 'var(--cyan)', established: 'var(--amber)',
}

function ArtistCard({ artist, metric, isScouting = false }: {
  artist: Artist
  metric?: { label: string; value: string; color: string }
  isScouting?: boolean
}) {
  return (
    <Link href={`/artist/${artist.spotify_id}`} style={{
      display: 'block', background: 'var(--bg-panel)', border: '2px solid var(--line)',
      padding: 14, textDecoration: 'none', color: 'inherit',
    }}>
      <div className="display" style={{ fontSize: 18, color: 'var(--ink-hi)', lineHeight: 1 }}>{artist.name}</div>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
        <span className="tag" style={{
          color: TIER_COLORS[artist.tier] ?? 'var(--ink-mid)', fontSize: 9,
          border: `1px solid ${TIER_COLORS[artist.tier] ?? 'var(--line)'}`, padding: '1px 5px',
          background: `${TIER_COLORS[artist.tier] ?? 'transparent'}18`,
        }}>{artist.tier.toUpperCase()}</span>
        {artist.genre && (
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>
            {artist.genre.toUpperCase().slice(0, 16)}
          </span>
        )}
        {isScouting && (
          <span className="tag" style={{ color: 'var(--amber)', border: '1px solid var(--amber)', padding: '1px 4px', fontSize: 9 }}>
            SCOUTING
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

type OnRampSection = {
  artists: Artist[]
  metrics: Record<string, number>
  metricLabel: string
  metricColor: string
  format: (v: number) => string
}

async function getOnRamps(userId: string) {
  const supabase = await createClient()

  // Use latest available stats date, not necessarily today
  const { data: latestRow } = await supabase
    .from('artist_stats_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle()
  const statsDate = latestRow?.date
  if (!statsDate) return null

  const { data: label } = await supabase
    .from('labels').select('genre_1, genre_2, country').eq('id', userId).single()

  // ── Breaking ───────────────────────────────────────────────────────────────
  // Primary: top 5 by stream_velocity_7d. Fallback: top 5 by monthly_listeners.
  let breaking: OnRampSection | null = null
  const { data: vStats } = await supabase.from('artist_stats_daily')
    .select('artist_id, stream_velocity_7d').eq('date', statsDate)
    .not('stream_velocity_7d', 'is', null).order('stream_velocity_7d', { ascending: false }).limit(5)
  if (vStats?.length) {
    const { data: artists } = await supabase.from('artists').select('*')
      .in('id', vStats.map(s => s.artist_id)).neq('tier', 'major')
    if (artists?.length) {
      breaking = {
        artists: artists as Artist[],
        metrics: Object.fromEntries(vStats.map(s => [s.artist_id, s.stream_velocity_7d])),
        metricLabel: 'VELOCITY', metricColor: 'var(--lime)',
        format: v => `+${v.toFixed(1)}%`,
      }
    }
  }
  if (!breaking) {
    const { data: lStats } = await supabase.from('artist_stats_daily')
      .select('artist_id, monthly_listeners').eq('date', statsDate)
      .not('monthly_listeners', 'is', null).order('monthly_listeners', { ascending: false }).limit(8)
    if (lStats?.length) {
      const { data: artists } = await supabase.from('artists').select('*')
        .in('id', lStats.map(s => s.artist_id)).neq('tier', 'major')
      if (artists?.length) {
        breaking = {
          artists: artists as Artist[],
          metrics: Object.fromEntries(lStats.map(s => [s.artist_id, s.monthly_listeners])),
          metricLabel: 'LISTENERS', metricColor: 'var(--lime)',
          format: v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`,
        }
      }
    }
  }

  // ── Genre picks ────────────────────────────────────────────────────────────
  // Primary: top 3 by momentum_score for label genres. Fallback: monthly_listeners.
  let genre: OnRampSection | null = null
  if (label?.genre_1) {
    const genres = [label.genre_1, label.genre_2].filter(Boolean) as string[]
    const orFilter = genres.map(g => `genre.ilike.%${g}%`).join(',')
    const { data: gArtists } = await supabase.from('artists').select('id').or(orFilter).neq('tier', 'major')
    if (gArtists?.length) {
      const ids = gArtists.map(a => a.id)
      const { data: mStats } = await supabase.from('artist_stats_daily')
        .select('artist_id, momentum_score').eq('date', statsDate)
        .in('artist_id', ids).not('momentum_score', 'is', null)
        .order('momentum_score', { ascending: false }).limit(3)
      if (mStats?.length) {
        const { data: artists } = await supabase.from('artists').select('*').in('id', mStats.map(s => s.artist_id))
        if (artists?.length) {
          genre = {
            artists: artists as Artist[],
            metrics: Object.fromEntries(mStats.map(s => [s.artist_id, s.momentum_score])),
            metricLabel: 'SCORE', metricColor: 'var(--cyan)',
            format: v => v.toFixed(0),
          }
        }
      }
      if (!genre) {
        const { data: lStats } = await supabase.from('artist_stats_daily')
          .select('artist_id, monthly_listeners').eq('date', statsDate)
          .in('artist_id', ids).not('monthly_listeners', 'is', null)
          .order('monthly_listeners', { ascending: false }).limit(5)
        if (lStats?.length) {
          const { data: artists } = await supabase.from('artists').select('*').in('id', lStats.map(s => s.artist_id))
          if (artists?.length) {
            genre = {
              artists: artists as Artist[],
              metrics: Object.fromEntries(lStats.map(s => [s.artist_id, s.monthly_listeners])),
              metricLabel: 'LISTENERS', metricColor: 'var(--cyan)',
              format: v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`,
            }
          }
        }
      }
    }
  }

  // ── Regional ───────────────────────────────────────────────────────────────
  // Primary: top 5 by velocity in same country. Fallback: monthly_listeners.
  let regional: OnRampSection | null = null
  if (label?.country) {
    const { data: rArtists } = await supabase.from('artists').select('id')
      .eq('country', label.country).neq('tier', 'major')
    if (rArtists?.length) {
      const ids = rArtists.map(a => a.id)
      const { data: vRStats } = await supabase.from('artist_stats_daily')
        .select('artist_id, stream_velocity_7d').eq('date', statsDate)
        .in('artist_id', ids).not('stream_velocity_7d', 'is', null)
        .order('stream_velocity_7d', { ascending: false }).limit(5)
      if (vRStats?.length) {
        const { data: artists } = await supabase.from('artists').select('*').in('id', vRStats.map(s => s.artist_id))
        if (artists?.length) {
          regional = {
            artists: artists as Artist[],
            metrics: Object.fromEntries(vRStats.map(s => [s.artist_id, s.stream_velocity_7d])),
            metricLabel: 'VELOCITY', metricColor: 'var(--amber)',
            format: v => `+${v.toFixed(1)}%`,
          }
        }
      }
      if (!regional) {
        const { data: lRStats } = await supabase.from('artist_stats_daily')
          .select('artist_id, monthly_listeners').eq('date', statsDate)
          .in('artist_id', ids).not('monthly_listeners', 'is', null)
          .order('monthly_listeners', { ascending: false }).limit(5)
        if (lRStats?.length) {
          const { data: artists } = await supabase.from('artists').select('*').in('id', lRStats.map(s => s.artist_id))
          if (artists?.length) {
            regional = {
              artists: artists as Artist[],
              metrics: Object.fromEntries(lRStats.map(s => [s.artist_id, s.monthly_listeners])),
              metricLabel: 'LISTENERS', metricColor: 'var(--amber)',
              format: v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`,
            }
          }
        }
      }
    }
  }

  const hasVelocity = breaking?.metricLabel === 'VELOCITY'
  return { label, breaking, genre, regional, hasVelocity }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { q } = await searchParams

  const scoutData = await supabase
    .from('scouts').select('artist_id').eq('label_id', user!.id).is('completed_at', null)
  const activeScoutIds = new Set((scoutData.data ?? []).map(s => s.artist_id))

  let searchResults: Artist[] = []
  if (q && q.length >= 2) {
    const { data } = await supabase.from('artists').select('*').ilike('name', `%${q}%`).neq('tier', 'major').limit(20)
    searchResults = (data ?? []) as Artist[]
  }

  const onRamps = !q ? await getOnRamps(user!.id) : null

  return (
    <div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 960 }}>
      <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 8 }}>FIND ARTISTS</div>
      <div style={{ marginBottom: 24 }}>
        <SearchBar initial={q ?? ''} activeScoutIds={[...activeScoutIds]} />
      </div>

      {q && (
        <div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 12 }}>
            {searchResults.length} RESULTS FOR &quot;{q.toUpperCase()}&quot;
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {searchResults.map(a => <ArtistCard key={a.id} artist={a} isScouting={activeScoutIds.has(a.id)} />)}
          </div>
          {searchResults.length === 0 && (
            <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>No artists found</div>
          )}
        </div>
      )}

      {!q && onRamps && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {onRamps.breaking && (
            <section>
              <div className="tag" style={{ color: 'var(--lime)', fontSize: 10, marginBottom: 12 }}>
                {onRamps.breaking.metricLabel === 'VELOCITY' ? 'BREAKING THIS WEEK' : 'TOP ARTISTS'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.breaking.artists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: onRamps.breaking!.metricLabel,
                    value: onRamps.breaking!.format(onRamps.breaking!.metrics[a.id] ?? 0),
                    color: onRamps.breaking!.metricColor,
                  }} isScouting={activeScoutIds.has(a.id)} />
                ))}
              </div>
            </section>
          )}
          {onRamps.genre && (
            <section>
              <div className="tag" style={{ color: 'var(--cyan)', fontSize: 10, marginBottom: 12 }}>YOUR GENRE PICKS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.genre.artists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: onRamps.genre!.metricLabel,
                    value: onRamps.genre!.format(onRamps.genre!.metrics[a.id] ?? 0),
                    color: onRamps.genre!.metricColor,
                  }} isScouting={activeScoutIds.has(a.id)} />
                ))}
              </div>
            </section>
          )}
          {onRamps.regional && (
            <section>
              <div className="tag" style={{ color: 'var(--amber)', fontSize: 10, marginBottom: 12 }}>TRENDING IN YOUR REGION</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {onRamps.regional.artists.map(a => (
                  <ArtistCard key={a.id} artist={a} metric={{
                    label: onRamps.regional!.metricLabel,
                    value: onRamps.regional!.format(onRamps.regional!.metrics[a.id] ?? 0),
                    color: onRamps.regional!.metricColor,
                  }} isScouting={activeScoutIds.has(a.id)} />
                ))}
              </div>
            </section>
          )}
          {!onRamps.breaking && !onRamps.genre && !onRamps.regional && (
            <div style={{ color: 'var(--ink-mid)', fontSize: 13 }}>
              No on-ramp data yet -- the pipeline runs daily at 07:00 UTC.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
