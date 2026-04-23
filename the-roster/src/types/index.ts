export interface ScoreBreakdown {
  streams: number
  social: number
  charts: number
  momentum: number
}

export interface Artist {
  id: string
  spotify_id: string
  name: string
  image_url: string | null
  genre: string | null
  country: string | null
  created_at: string
}

export interface ArtistStats {
  id: string
  artist_id: string
  date: string
  spotify_monthly_listeners: number | null
  spotify_streams_7d: number | null
  ig_followers: number | null
  tiktok_followers: number | null
  tiktok_views_7d: number | null
  chart_position: number | null
  score_total: number | null
  score_breakdown: ScoreBreakdown | null
}

export interface MarketPrice {
  id: string
  artist_id: string
  date: string
  price: number
  price_change_pct: number | null
}

export interface League {
  id: string
  name: string
  season: number
  start_date: string | null
  end_date: string | null
  max_players: number
  created_at: string
}

export interface User {
  id: string
  username: string
  budget: number
  league_id: string | null
  created_at: string
}

export interface Roster {
  id: string
  user_id: string
  artist_id: string
  shares_owned: number
  acquired_price: number
  acquired_at: string
}

export interface Transaction {
  id: string
  user_id: string
  artist_id: string
  type: 'buy' | 'sell'
  price: number
  shares: number
  executed_at: string
}
