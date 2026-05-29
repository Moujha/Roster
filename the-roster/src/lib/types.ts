// Shared TypeScript types for the Roster Phase 1 data model.
// All field names match Supabase column names exactly.

export type Tier = 'underground' | 'emerging' | 'rising' | 'established' | 'major'

export type ContractStatus = 'active' | 'expired' | 'dropped'

export interface Label {
  id: string
  label_name: string
  genre_1: string | null
  genre_2: string | null
  country: string | null
  treasury: number
  created_at: string
}

export interface Artist {
  id: string
  spotify_id: string
  name: string
  genre: string | null
  country: string | null
  tier: Tier
  tier_updated_at: string | null
}

export interface ArtistStats {
  artist_id: string
  date: string
  monthly_listeners: number | null
  daily_streams_top10: number | null
  stream_velocity_7d: number | null
  listener_growth_28d: number | null
  catalog_depth_score: number | null
  momentum_score: number | null
}

export interface Contract {
  id: string
  label_id: string
  artist_id: string
  status: ContractStatus
  signing_bonus: number
  rev_split_label_pct: number
  term_months: 3 | 6 | 12
  start_date: string
  end_date: string
  baseline_listeners: number | null
  baseline_growth_pct: number | null
  royalties_earned: number
  dev_spend_total: number
  created_at: string
}

export interface LabelHistory {
  id: string
  label_id: string
  contract_id: string
  artist_name: string
  artist_tier: Tier
  listeners_at_signing: number | null
  listeners_at_end: number | null
  signing_bonus: number
  total_royalties: number
  total_dev_spend: number
  net_pnl: number
  reason: 'natural' | 'dropped'
  completed_at: string
}
