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
  reputation: number
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

export type EventType = 'royalty_paid' | 'artist_signed' | 'contract_expired' | 'tier_up' | 'scout_completed' | 'release_boost' | 'breaking_alert'

export interface DevAllocation {
  contract_id: string
  playlist_tier: 'none' | 'light' | 'standard' | 'heavy'
  social_push_tier: 'none' | 'light' | 'standard' | 'heavy'
  updated_at: string
}

export interface ReleaseAmplification {
  id: string
  label_id: string
  contract_id: string
  artist_id: string
  spend_tier: 'light' | 'standard' | 'heavy'
  peak_multiplier: number
  cost: number
  triggered_at: string
  expires_at: string
  created_at: string
}

export interface LabelEvent {
  id: string
  label_id: string
  event_type: EventType
  artist_name: string
  payload: Record<string, unknown>
  created_at: string
}

export interface Scout {
  id: string
  label_id: string
  artist_id: string
  started_at: string
  completes_at: string
  completed_at: string | null
  is_discovery: boolean
}

export interface WatchlistEntry {
  id: string
  label_id: string
  artist_id: string
  added_at: string
}

export interface Negotiation {
  id: string
  label_id: string
  artist_id: string
  round: number
  status: 'countered' | 'accepted' | 'rejected' | 'cooling_off'
  offer: { bonus: number; rev_split_label_pct: number; term_months: 3 | 6 | 12 }
  counter_offer: { bonus: number; rev_split_label_pct: number; term_months: 3 | 6 | 12 } | null
  cooling_off_until: string | null
  created_at: string
  updated_at: string
}
