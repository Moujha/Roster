import { createServiceClient } from '@/lib/supabase/service'
import { computeEngagementMultiplier, computeWeeklyRoyalties } from '@/lib/royalty'

async function handler(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  // Resolve most recent stats date (pipeline may lag)
  const { data: latestRow } = await supabase
    .from('artist_stats_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const statsDate = latestRow?.date
  if (!statsDate) return Response.json({ processed: 0, expired: 0, date: today })

  const statsWeekStart = new Date(
    new Date(statsDate + 'T00:00:00Z').getTime() - 6 * 86400_000,
  ).toISOString().slice(0, 10)

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, label_id, artist_id, rev_split_label_pct, end_date, signing_bonus, dev_spend_total, baseline_listeners, royalties_paid_through')
    .eq('status', 'active')

  if (!contracts?.length) return Response.json({ processed: 0, expired: 0, date: today })

  // Batch-fetch artist names + tiers for event writing and tier-up detection
  const { data: artistRows } = await supabase
    .from('artists')
    .select('id, name, tier, tier_updated_at')
    .in('id', contracts.map(c => c.artist_id))
  const artistMap = new Map((artistRows ?? []).map(a => [a.id, a]))

  // artist_id → monthly_listeners at statsDate, used in expiry pass
  const listenersMap = new Map<string, number>()
  let processed = 0

  // ── Pass 1: compute and pay royalties ────────────────────────────────────────
  for (const c of contracts) {
    const { data: statsRow, error: statsErr } = await supabase
      .from('artist_stats_daily')
      .select('monthly_listeners')
      .eq('artist_id', c.artist_id)
      .eq('date', statsDate)
      .maybeSingle()

    if (statsErr || !statsRow?.monthly_listeners) continue

    if (c.royalties_paid_through && c.royalties_paid_through >= statsDate) continue

    listenersMap.set(c.artist_id, statsRow.monthly_listeners)

    const { data: streamRows, error: streamsErr } = await supabase
      .from('artist_stats_daily')
      .select('daily_streams_top10')
      .eq('artist_id', c.artist_id)
      .gte('date', statsWeekStart)
      .lte('date', statsDate)
      .not('daily_streams_top10', 'is', null)

    if (streamsErr) continue

    const actualWeeklyStreams = streamRows?.length
      ? streamRows.reduce((sum, r) => sum + (r.daily_streams_top10 ?? 0), 0)
      : null

    const royalties = computeWeeklyRoyalties(
      statsRow.monthly_listeners,
      c.rev_split_label_pct,
      actualWeeklyStreams,
    )

    const [{ data: contract, error: contractReadErr }, { data: label, error: labelReadErr }] = await Promise.all([
      supabase.from('contracts').select('royalties_earned').eq('id', c.id).single(),
      supabase.from('labels').select('treasury').eq('id', c.label_id).single(),
    ])

    if (contractReadErr || labelReadErr) continue

    const [{ error: contractWriteErr }, { error: labelWriteErr }] = await Promise.all([
      supabase.from('contracts')
        .update({ royalties_earned: (contract?.royalties_earned ?? 0) + royalties, royalties_paid_through: statsDate })
        .eq('id', c.id),
      supabase.from('labels')
        .update({ treasury: (label?.treasury ?? 0) + royalties })
        .eq('id', c.label_id),
    ])

    if (contractWriteErr || labelWriteErr) continue

    processed++
    const multiplier = computeEngagementMultiplier(statsRow.monthly_listeners, actualWeeklyStreams)
    await supabase.from('label_events').insert({
      label_id: c.label_id,
      event_type: 'royalty_paid',
      artist_name: artistMap.get(c.artist_id)?.name ?? 'Unknown',
      payload: {
        amount: royalties,
        multiplier,
        has_stream_data: actualWeeklyStreams !== null,
      },
    })
  }

  // ── Pass 2: expire contracts past end_date ───────────────────────────────────
  const toExpire = contracts.filter(c => c.end_date <= today)
  let expired = 0

  for (const c of toExpire) {
    const [{ data: contract, error: contractFetchErr }, { data: artist, error: artistFetchErr }] = await Promise.all([
      supabase.from('contracts').select('royalties_earned').eq('id', c.id).single(),
      supabase.from('artists').select('name, tier').eq('id', c.artist_id).single(),
    ])

    if (contractFetchErr || artistFetchErr) continue

    const totalRoyalties = contract?.royalties_earned ?? 0

    const { error: expireErr } = await supabase
      .from('contracts').update({ status: 'expired' }).eq('id', c.id)

    if (expireErr) continue

    await supabase.from('label_history').insert({
      label_id: c.label_id,
      contract_id: c.id,
      artist_name: artist?.name ?? 'Unknown',
      artist_tier: artist?.tier ?? 'underground',
      listeners_at_signing: c.baseline_listeners,
      listeners_at_end: listenersMap.get(c.artist_id) ?? null,
      signing_bonus: c.signing_bonus,
      total_royalties: totalRoyalties,
      total_dev_spend: c.dev_spend_total,
      net_pnl: totalRoyalties - c.signing_bonus - c.dev_spend_total,
      reason: 'natural',
      completed_at: today,
    })

    expired++
    await supabase.from('label_events').insert({
      label_id: c.label_id,
      event_type: 'contract_expired',
      artist_name: artist?.name ?? 'Unknown',
      payload: {
        net_pnl: totalRoyalties - c.signing_bonus - c.dev_spend_total,
        total_royalties: totalRoyalties,
        signing_bonus: c.signing_bonus,
        reason: 'natural',
      },
    })
  }

  // ── Pass 3: detect tier-ups on still-active contracts ────────────────────────
  const expiredIds = new Set(toExpire.map(c => c.id))
  const remaining = contracts.filter(c => !expiredIds.has(c.id))

  for (const c of remaining) {
    const artist = artistMap.get(c.artist_id)
    if (!artist?.tier_updated_at) continue
    if (artist.tier_updated_at < statsWeekStart || artist.tier_updated_at > statsDate) continue
    await supabase.from('label_events').insert({
      label_id: c.label_id,
      event_type: 'tier_up',
      artist_name: artist.name,
      payload: { new_tier: artist.tier },
    })
  }

  // ── Pass 4: complete overdue scouts ─────────────────────────────────────────
  const { data: overdueScouts } = await supabase
    .from('scouts')
    .select('id, label_id, artist_id, started_at, completes_at')
    .lte('completes_at', statsDate)
    .is('completed_at', null)

  const scoutArtistIds = (overdueScouts ?? [])
    .map(s => s.artist_id)
    .filter(id => !artistMap.has(id))

  if (scoutArtistIds.length) {
    const { data: scoutArtists } = await supabase
      .from('artists').select('id, name, tier, tier_updated_at').in('id', scoutArtistIds)
    for (const a of scoutArtists ?? []) artistMap.set(a.id, a)
  }

  for (const s of overdueScouts ?? []) {
    const { error } = await supabase
      .from('scouts').update({ completed_at: statsDate }).eq('id', s.id)
    if (error) continue

    const artistName = artistMap.get(s.artist_id)?.name ?? 'Unknown'
    const durationWeeks = Math.round(
      (new Date(s.completes_at + 'T00:00:00Z').getTime() -
       new Date(s.started_at + 'T00:00:00Z').getTime()) / (7 * 86400_000),
    )

    await supabase.from('label_events').insert({
      label_id: s.label_id,
      event_type: 'scout_completed',
      artist_name: artistName,
      payload: { weeks_taken: durationWeeks },
    })
  }

  return Response.json({ processed, expired, date: today })
}

export const GET = handler
export const POST = handler
