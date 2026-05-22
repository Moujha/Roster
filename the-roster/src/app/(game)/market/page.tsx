import { createClient } from '@/lib/supabase/server'

type MarketArtist = {
  id: string
  name: string
  spotify_id: string
  image_url: string | null
  genre: string | null
  price: number
  price_change_pct: number | null
  score: number
  monthly_listeners: number
}

async function getMarket(): Promise<MarketArtist[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [artistsRes, pricesRes, statsRes] = await Promise.all([
    supabase.from('artists').select('id, name, spotify_id, image_url, genre'),
    supabase.from('market_prices').select('artist_id, price, price_change_pct').eq('date', today),
    supabase.from('artist_stats').select('artist_id, score_total, spotify_monthly_listeners').eq('date', today),
  ])

  const priceMap = new Map((pricesRes.data ?? []).map(p => [p.artist_id, p]))
  const statsMap = new Map((statsRes.data ?? []).map(s => [s.artist_id, s]))

  return (artistsRes.data ?? [])
    .map(artist => ({
      ...artist,
      price: priceMap.get(artist.id)?.price ?? 0,
      price_change_pct: priceMap.get(artist.id)?.price_change_pct ?? null,
      score: statsMap.get(artist.id)?.score_total ?? 0,
      monthly_listeners: statsMap.get(artist.id)?.spotify_monthly_listeners ?? 0,
    }))
    .sort((a, b) => b.price - a.price)
}

function fmtPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`
  return price === 0 ? '—' : `$${price}`
}

function fmtListeners(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n > 0 ? String(n) : '—'
}

const AVATAR_COLORS = [
  '#7c3aed', '#db2777', '#059669', '#d97706',
  '#2563eb', '#dc2626', '#0891b2', '#65a30d',
]

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default async function MarketPage() {
  const artists = await getMarket()
  const today = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Market</h1>
          <p className="text-zinc-500 text-sm mt-1">{today} · {artists.length} artists</p>
        </div>
      </div>

      {artists.length === 0 ? (
        <div className="text-center py-32 text-zinc-600">
          <p className="text-lg font-mono">No market data yet</p>
          <p className="text-sm mt-2">Run the pipeline to populate scores and prices.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {artists.map((artist, rank) => {
            const up = artist.price_change_pct !== null && artist.price_change_pct >= 0
            const hasChange = artist.price_change_pct !== null
            const initials = artist.name
              .split(' ')
              .map(w => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()

            return (
              <div
                key={artist.id}
                className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-5 hover:border-zinc-700 transition-colors"
              >
                {/* Header: avatar + name + rank */}
                <div className="flex items-start gap-3 mb-5">
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                      style={{ backgroundColor: avatarColor(artist.name) }}
                    >
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold leading-tight truncate">{artist.name}</p>
                    {artist.genre ? (
                      <p className="text-xs text-zinc-500 mt-0.5 capitalize">{artist.genre}</p>
                    ) : (
                      <p className="text-xs text-zinc-700 mt-0.5">—</p>
                    )}
                  </div>
                  <span className="text-xs text-zinc-700 font-mono flex-shrink-0 pt-0.5">
                    #{rank + 1}
                  </span>
                </div>

                {/* Price row */}
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-2xl font-bold font-mono text-white">
                    {fmtPrice(artist.price)}
                  </span>
                  {hasChange ? (
                    <span className={`text-sm font-mono font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                      {up ? '▲' : '▼'} {Math.abs(artist.price_change_pct!).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600 font-mono">first run</span>
                  )}
                </div>

                {/* Score bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-zinc-600">Score</span>
                    <span className="text-xs font-mono text-amber-400 font-medium">
                      {artist.score}/100
                    </span>
                  </div>
                  <div className="h-[3px] bg-zinc-800 rounded-full">
                    <div
                      className="h-[3px] bg-amber-400 rounded-full"
                      style={{ width: `${artist.score}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-600">
                    {fmtListeners(artist.monthly_listeners)} monthly listeners
                  </span>
                  <button
                    disabled
                    className="text-xs text-zinc-600 border border-zinc-800 px-3 py-1 rounded-md cursor-not-allowed"
                  >
                    Buy
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
