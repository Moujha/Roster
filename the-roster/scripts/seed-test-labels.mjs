/**
 * Seed script: creates 5 test labels with contracts, royalty history, and
 * completed deals so the leaderboard has meaningful data.
 *
 * Usage:
 *   node scripts/seed-test-labels.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 * Uses the Supabase Admin API (no auth required for service role).
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load .env.local ──────────────────────────────────────────────────────────
const env = {}
try {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
} catch { /* ignore */ }

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY  || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const authHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey': SERVICE_KEY,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function adminPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(data)}`)
  return data
}

async function restInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Prefer': 'return=representation' },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`INSERT ${table} → ${res.status}: ${JSON.stringify(data)}`)
  return data
}

async function restUpsert(table, rows, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`UPSERT ${table} → ${res.status}: ${JSON.stringify(data)}`)
  return data
}

async function restGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: authHeaders,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`GET ${table} → ${res.status}: ${JSON.stringify(data)}`)
  return data
}

async function restDelete(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY },
  })
  if (!res.ok && res.status !== 204) {
    const data = await res.text()
    throw new Error(`DELETE ${table} → ${res.status}: ${data}`)
  }
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400_000)
  return d.toISOString().slice(0, 10)
}

function isoAgo(n) {
  return new Date(Date.now() - n * 86400_000).toISOString()
}

// ── Test labels definition ───────────────────────────────────────────────────

const TEST_LABELS = [
  {
    email: 'velocity@roster-test.dev',
    label_name: 'VELOCITY RECORDS',
    genre_1: 'hip-hop', genre_2: 'rap',
    country: 'US',
    treasury: 312_000,
    reputation: 420,
    royalties_90d: [4200, 3800, 4600, 5100, 4900, 3600, 4400, 5800, 6100, 5500, 4700, 5200],
    history: [
      { artist: 'Marlo Wave',  tier: 'rising',    listeners_start: 680_000, listeners_end: 1_420_000, bonus: 35_000, royalties: 41_200, dev: 3_800, months_ago: 95 },
      { artist: 'Hex Grove',   tier: 'emerging',  listeners_start: 180_000, listeners_end: 520_000,   bonus: 12_000, royalties: 18_600, dev: 1_200, months_ago: 70 },
    ],
    active: [
      { artist: 'Cold Tempo',  tier: 'rising',    listeners: 920_000,  bonus: 48_000, split: 28, months: 6 },
      { artist: 'Prism Audio', tier: 'established', listeners: 3_100_000, bonus: 140_000, split: 32, months: 12 },
    ],
  },
  {
    email: 'indiepulse@roster-test.dev',
    label_name: 'INDIE PULSE',
    genre_1: 'indie', genre_2: 'alternative',
    country: 'GB',
    treasury: 178_000,
    reputation: 195,
    royalties_90d: [1100, 980, 1250, 1400, 1180, 1320, 900, 1050, 1460, 1200, 980, 1380],
    history: [
      { artist: 'Solar Drift', tier: 'emerging', listeners_start: 95_000, listeners_end: 310_000, bonus: 8_000, royalties: 9_400, dev: 720, months_ago: 80 },
    ],
    active: [
      { artist: 'Glass Vowel',  tier: 'emerging', listeners: 290_000, bonus: 14_000, split: 25, months: 6 },
      { artist: 'The Pale Men', tier: 'rising',   listeners: 760_000, bonus: 40_000, split: 27, months: 12 },
    ],
  },
  {
    email: 'neonsound@roster-test.dev',
    label_name: 'NEON SOUND',
    genre_1: 'electronic', genre_2: 'dance',
    country: 'DE',
    treasury: 241_000,
    reputation: 85,
    royalties_90d: [480, 510, 390, 620, 580, 440, 700, 650, 430, 590, 710, 480],
    history: [],
    active: [
      { artist: 'Arca-7',      tier: 'emerging',  listeners: 210_000, bonus: 9_000,  split: 26, months: 6 },
    ],
  },
  {
    email: 'streetlevel@roster-test.dev',
    label_name: 'STREET LEVEL',
    genre_1: 'hip-hop', genre_2: 'grime',
    country: 'GB',
    treasury: 198_000,
    reputation: 130,
    royalties_90d: [310, 290, 420, 380, 350, 410, 280, 370, 440, 320, 390, 460],
    history: [
      { artist: 'Young Volt',  tier: 'underground', listeners_start: 12_000, listeners_end: 88_000,  bonus: 1_200, royalties: 1_840, dev: 180, months_ago: 60 },
      { artist: 'Kira DC',     tier: 'emerging',    listeners_start: 55_000, listeners_end: 200_000, bonus: 7_000, royalties: 8_100, dev: 500, months_ago: 50 },
    ],
    active: [
      { artist: 'Phantom Rd',  tier: 'emerging',  listeners: 140_000, bonus: 8_500,  split: 22, months: 3 },
      { artist: 'Zero Bass',   tier: 'underground', listeners: 28_000, bonus: 1_800, split: 20, months: 6 },
    ],
  },
  {
    email: 'apexmusic@roster-test.dev',
    label_name: 'APEX MUSIC',
    genre_1: 'pop', genre_2: 'r&b',
    country: 'US',
    treasury: 302_000,
    reputation: 255,
    royalties_90d: [2100, 1900, 2400, 2200, 1800, 2600, 2300, 2100, 2500, 2000, 2700, 2400],
    history: [
      { artist: 'Lumi Star',  tier: 'rising',   listeners_start: 510_000, listeners_end: 980_000, bonus: 22_000, royalties: 28_500, dev: 2_100, months_ago: 85 },
    ],
    active: [
      { artist: 'Siera V',   tier: 'established', listeners: 2_600_000, bonus: 110_000, split: 30, months: 12 },
    ],
  },
]

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎵 Seeding test labels...\n')

  // Collect existing artists to avoid duplicate spotify_ids
  const existing = await restGet('artists', 'select=spotify_id&spotify_id=like.test_%25')
  const existingIds = new Set(existing.map(a => a.spotify_id))

  let artistCounter = existingIds.size

  for (const def of TEST_LABELS) {
    process.stdout.write(`  ${def.label_name}... `)

    // 1. Create or retrieve auth user
    let userId
    try {
      const user = await adminPost('/auth/v1/admin/users', {
        email: def.email,
        password: 'Roster2025!',
        email_confirm: true,
        user_metadata: { label_name: def.label_name },
      })
      userId = user.id
    } catch (e) {
      if (e.message.includes('already been registered') || e.message.includes('already exists')) {
        // User exists — search all users and find by email (email filter param is ignored by API)
        const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
          headers: authHeaders,
        })
        const data = await res.json()
        const found = data.users?.find(u => u.email === def.email)
        userId = found?.id
        if (!userId) { console.error(`\n  ✗ Could not resolve user for ${def.email}`); continue }
      } else throw e
    }

    // 2. Upsert label
    await restUpsert('labels', {
      id: userId,
      label_name: def.label_name,
      genre_1: def.genre_1,
      genre_2: def.genre_2,
      country: def.country,
      treasury: def.treasury,
      reputation: def.reputation,
    }, 'id')

    // 2b. Wipe previous runs' data so this is idempotent
    await restDelete('label_events',    `label_id=eq.${userId}`)
    await restDelete('label_history',   `label_id=eq.${userId}`)
    await restDelete('contracts',       `label_id=eq.${userId}`)

    // 3. Create artists + history contracts
    for (const h of def.history) {
      const spotifyId = `test_${++artistCounter}_${h.artist.toLowerCase().replace(/\s+/g, '_')}`
      if (!existingIds.has(spotifyId)) {
        await restUpsert('artists', {
          spotify_id: spotifyId,
          name: h.artist,
          tier: h.tier,
          genre: def.genre_1,
          country: def.country,
        }, 'spotify_id')
        existingIds.add(spotifyId)
      }
      const [artistRow] = await restGet('artists', `select=id&spotify_id=eq.${spotifyId}`)

      // Completed contract
      const startDate = daysAgo(h.months_ago * 30 + 90)
      const endDate   = daysAgo(h.months_ago * 30)
      const [contract] = await restUpsert('contracts', {
        label_id: userId,
        artist_id: artistRow.id,
        status: 'expired',
        signing_bonus: h.bonus,
        rev_split_label_pct: 30,
        term_months: 6,
        start_date: startDate,
        end_date: endDate,
        baseline_listeners: h.listeners_start,
        royalties_earned: h.royalties,
        dev_spend_total: h.dev,
      }, 'id')

      // label_history entry
      await restUpsert('label_history', {
        label_id: userId,
        contract_id: contract.id,
        artist_name: h.artist,
        artist_tier: h.tier,
        listeners_at_signing: h.listeners_start,
        listeners_at_end: h.listeners_end,
        signing_bonus: h.bonus,
        total_royalties: h.royalties,
        total_dev_spend: h.dev,
        net_pnl: h.royalties - h.bonus - h.dev,
        reason: 'natural',
        completed_at: endDate,
      }, 'id')
    }

    // 4. Create artists + active contracts
    const activeArtistIds = []
    for (const a of def.active) {
      const spotifyId = `test_${++artistCounter}_${a.artist.toLowerCase().replace(/\s+/g, '_')}`
      if (!existingIds.has(spotifyId)) {
        await restUpsert('artists', {
          spotify_id: spotifyId,
          name: a.artist,
          tier: a.tier,
          genre: def.genre_1,
          country: def.country,
        }, 'spotify_id')
        existingIds.add(spotifyId)
      }
      const [artistRow] = await restGet('artists', `select=id&spotify_id=eq.${spotifyId}`)
      activeArtistIds.push(artistRow.id)

      const startDate = daysAgo(30)
      const endDate   = daysAgo(-(a.months * 30 - 30))  // future
      await restUpsert('contracts', {
        label_id: userId,
        artist_id: artistRow.id,
        status: 'active',
        signing_bonus: a.bonus,
        rev_split_label_pct: a.split,
        term_months: a.months,
        start_date: startDate,
        end_date: endDate,
        baseline_listeners: a.listeners,
        royalties_earned: 0,
        dev_spend_total: 0,
      }, 'id')
    }

    // 5. Royalty events spread over last 90 days (weekly cadence)
    const amounts = def.royalties_90d
    for (let i = 0; i < amounts.length; i++) {
      const daysBack = 90 - i * 7  // weekly, from 90 days ago to ~13 days ago
      await restInsert('label_events', {
        label_id: userId,
        event_type: 'royalty_paid',
        artist_name: def.active[0]?.artist ?? def.history[0]?.artist ?? 'Various',
        payload: {
          amount: amounts[i],
          multiplier: 1.0 + Math.random() * 0.5,
          has_stream_data: true,
        },
        created_at: isoAgo(daysBack),
      })
    }

    // 6. Artist-signed events
    for (const a of def.active) {
      await restInsert('label_events', {
        label_id: userId,
        event_type: 'artist_signed',
        artist_name: a.artist,
        payload: { months: a.months, split_pct: a.split, signing_bonus: a.bonus },
        created_at: isoAgo(30),
      })
    }

    const totalRev = amounts.reduce((s, n) => s + n, 0)
    console.log(`✓  (90d revenue: $${totalRev.toLocaleString()})`)
  }

  console.log('\n✅ Done. Leaderboard should now show multiple labels.')
  console.log('\nTest credentials (all use password: Roster2025!):')
  for (const l of TEST_LABELS) {
    console.log(`  ${l.email}`)
  }
}

main().catch(err => { console.error('\n✗', err.message); process.exit(1) })
