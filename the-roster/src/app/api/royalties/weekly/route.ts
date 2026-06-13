import { createServiceClient } from '@/lib/supabase/service'
import {
  computeEngagementMultiplier, computeWeeklyRoyalties,
  computeReleaseMultiplier, computeCombinedMultiplier,
  computeGrowthRepDelta,
  DEV_BUDGET_PCT, DEV_COST_PCT, SOCIAL_FLOOR_PCTS,
  type DevTier,
} from '@/lib/royalty'

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
    .select('id, label_id, artist_id, rev_split_label_pct, end_date, signing_bonus, dev_spend_total, baseline_listeners, baseline_growth_pct, term_months, royalties_paid_through')
    .eq('status', 'active')

  if (!contracts?.length) return Response.json({ processed: 0, expired: 0, date: today })

  // Batch-fetch artist names + tiers + country for event writing, tier-up detection, and home crowd bonus
  const { data: artistRows } = await supabase
    .from('artists')
    .select('id, name, tier, tier_updated_at, country')
    .in('id', contracts.map(c => c.artist_id))
  const artistMap = new Map((artistRows ?? []).map(a => [a.id, a]))

  // Batch-fetch label countries for home crowd bonus (§3.5.3)
  const uniqueLabelIds = [...new Set(contracts.map(c => c.label_id))]
  const { data: labelRows } = await supabase
    .from('labels')
    .select('id, country')
    .in('id', uniqueLabelIds)
  const labelCountryMap = new Map((labelRows ?? []).map(l => [l.id, l.country ?? null]))

  // artist_id → monthly_listeners at statsDate, used in expiry pass
  const listenersMap = new Map<string, number>()
  let processed = 0

  // ── Pass 1: compute and pay royalties ────────────────────────────────────────
  for (const c of contracts) {
    const { data: statsRow, error: statsErr } = await supabase
      .from('artist_stats_daily')
      .select('monthly_listeners, stream_velocity_7d')
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

    // ── Dev multipliers ──────────────────────────────────────────────────────
    const { data: devAlloc } = await supabase
      .from('dev_allocations')
      .select('playlist_tier, social_push_tier')
      .eq('contract_id', c.id)
      .maybeSingle()

    const playlistTier = (devAlloc?.playlist_tier ?? 'none') as DevTier
    const socialTier   = (devAlloc?.social_push_tier ?? 'none') as DevTier

    // Social push: clamp stream drop against prior-week floor
    let adjustedStreams = actualWeeklyStreams
    if (adjustedStreams !== null && socialTier !== 'none') {
      const prevWeekStart = new Date(
        new Date(statsWeekStart + 'T00:00:00Z').getTime() - 7 * 86400_000,
      ).toISOString().slice(0, 10)
      const { data: prevRows } = await supabase
        .from('artist_stats_daily')
        .select('daily_streams_top10')
        .eq('artist_id', c.artist_id)
        .gte('date', prevWeekStart)
        .lt('date', statsWeekStart)
        .not('daily_streams_top10', 'is', null)
      if (prevRows?.length) {
        const prevWeekStreams = prevRows.reduce((s, r) => s + (r.daily_streams_top10 ?? 0), 0)
        const floor = prevWeekStreams * SOCIAL_FLOOR_PCTS[socialTier]
        adjustedStreams = Math.max(adjustedStreams, floor)
      }
    }

    const baseRoyalties = computeWeeklyRoyalties(
      statsRow.monthly_listeners,
      c.rev_split_label_pct,
      adjustedStreams,
    )

    // Active release amplification
    const { data: releaseAmp } = await supabase
      .from('release_amplifications')
      .select('peak_multiplier, triggered_at')
      .eq('contract_id', c.id)
      .gte('expires_at', statsDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let releaseMultiplier = 1.0
    if (releaseAmp) {
      const daysSince = Math.floor(
        (new Date(statsDate + 'T00:00:00Z').getTime() -
         new Date(releaseAmp.triggered_at + 'T00:00:00Z').getTime()) / 86400_000,
      )
      releaseMultiplier = computeReleaseMultiplier(releaseAmp.peak_multiplier, daysSince)
    }

    const combined = computeCombinedMultiplier(playlistTier, releaseMultiplier)
    // Home Crowd bonus (§3.5.3): 1.15× when label and artist share the same country
    const artistCountry = artistMap.get(c.artist_id)?.country ?? null
    const labelCountry = labelCountryMap.get(c.label_id) ?? null
    const homeCrowd = artistCountry && labelCountry && artistCountry === labelCountry ? 1.15 : 1.0
    const royalties = Math.round(baseRoyalties * combined * homeCrowd * 100) / 100

    // Dev spend (playlist + social, capped at 100% of dev budget)
    const devBudget = baseRoyalties * DEV_BUDGET_PCT
    const devCostRaw = (DEV_COST_PCT[playlistTier] + DEV_COST_PCT[socialTier]) * devBudget
    const devCost = Math.round(Math.min(devCostRaw, devBudget) * 100) / 100

    const [{ data: contract, error: contractReadErr }, { data: label, error: labelReadErr }] = await Promise.all([
      supabase.from('contracts').select('royalties_earned, dev_spend_total').eq('id', c.id).single(),
      supabase.from('labels').select('treasury').eq('id', c.label_id).single(),
    ])

    if (contractReadErr || labelReadErr) continue

    const [{ error: contractWriteErr }, { error: labelWriteErr }] = await Promise.all([
      supabase.from('contracts')
        .update({
          royalties_earned: (contract?.royalties_earned ?? 0) + royalties,
          dev_spend_total: (contract?.dev_spend_total ?? 0) + devCost,
          royalties_paid_through: statsDate,
        })
        .eq('id', c.id),
      supabase.from('labels')
        .update({ treasury: (label?.treasury ?? 0) + royalties - devCost })
        .eq('id', c.label_id),
    ])

    if (contractWriteErr || labelWriteErr) continue

    processed++
    const multiplier = computeEngagementMultiplier(statsRow.monthly_listeners, adjustedStreams)
    await supabase.from('label_events').insert({
      label_id: c.label_id,
      event_type: 'royalty_paid',
      artist_name: artistMap.get(c.artist_id)?.name ?? 'Unknown',
      payload: {
        amount: royalties,
        multiplier,
        combined_dev_multiplier: combined,
        dev_cost: devCost,
        has_stream_data: adjustedStreams !== null,
      },
    })

    // Breaking alert: fire if velocity exceeds tier-specific threshold, deduped to once per 7 days
    const velocity = (statsRow as unknown as { stream_velocity_7d: number | null }).stream_velocity_7d ?? null
    const artistTier = artistMap.get(c.artist_id)?.tier ?? 'emerging'
    const breakingThreshold = artistTier === 'underground' ? 50 : 25
    if (velocity !== null && velocity > breakingThreshold) {
      const artistName = artistMap.get(c.artist_id)?.name ?? 'Unknown'
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
      const { count: recentAlerts } = await supabase
        .from('label_events')
        .select('*', { count: 'exact', head: true })
        .eq('label_id', c.label_id)
        .eq('event_type', 'breaking_alert')
        .contains('payload', { artist_id: c.artist_id })
        .gte('created_at', sevenDaysAgo)
      if ((recentAlerts ?? 0) === 0) {
        await supabase.from('label_events').insert({
          label_id: c.label_id,
          event_type: 'breaking_alert',
          artist_name: artistName,
          payload: { artist_id: c.artist_id, velocity, threshold: breakingThreshold },
        })
      }
    }
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

    let endListeners = listenersMap.get(c.artist_id) ?? null
    if (endListeners === null) {
      const { data: latestStats } = await supabase
        .from('artist_stats_daily')
        .select('monthly_listeners')
        .eq('artist_id', c.artist_id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      endListeners = latestStats?.monthly_listeners ?? null
    }

    await supabase.from('label_history').insert({
      label_id: c.label_id,
      contract_id: c.id,
      artist_name: artist?.name ?? 'Unknown',
      artist_tier: artist?.tier ?? 'underground',
      listeners_at_signing: c.baseline_listeners,
      listeners_at_end: endListeners,
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
    // Reputation: +15 completion + growth contribution (§6.2.2/§6.2.3)
    const growthRepDelta = (c.baseline_listeners != null && endListeners !== null)
      ? computeGrowthRepDelta(
          c.baseline_listeners,
          endListeners,
          (c as unknown as { term_months: number }).term_months ?? 6,
          (c as unknown as { baseline_growth_pct: number | null }).baseline_growth_pct ?? 0,
        )
      : 0
    const { data: lbl15 } = await supabase.from('labels').select('reputation').eq('id', c.label_id).single()
    const newRep = Math.min(1000, Math.max(0, (lbl15?.reputation ?? 0) + 15 + growthRepDelta))
    await supabase.from('labels').update({ reputation: newRep }).eq('id', c.label_id)
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
    // Reputation +30 for tier-up during contract term
    const { data: lbl } = await supabase.from('labels').select('reputation').eq('id', c.label_id).single()
    await supabase.from('labels').update({ reputation: Math.min(1000, Math.max(0, (lbl?.reputation ?? 0) + 30)) }).eq('id', c.label_id)
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
      .from('artists').select('id, name, tier, tier_updated_at, country').in('id', scoutArtistIds)
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
