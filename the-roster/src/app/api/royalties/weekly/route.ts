import { createServiceClient } from '@/lib/supabase/service'
import { computeWeeklyRoyalties } from '@/lib/royalty'

export async function POST(request: Request) {
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
    .select('id, label_id, artist_id, rev_split_label_pct, end_date, signing_bonus, dev_spend_total, baseline_listeners')
    .eq('status', 'active')

  if (!contracts?.length) return Response.json({ processed: 0, expired: 0, date: today })

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
        .update({ royalties_earned: (contract?.royalties_earned ?? 0) + royalties })
        .eq('id', c.id),
      supabase.from('labels')
        .update({ treasury: (label?.treasury ?? 0) + royalties })
        .eq('id', c.label_id),
    ])

    if (contractWriteErr || labelWriteErr) continue

    processed++
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

    const [{ error: historyErr }, { error: expireErr }] = await Promise.all([
      supabase.from('label_history').insert({
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
      }),
      supabase.from('contracts').update({ status: 'expired' }).eq('id', c.id),
    ])

    if (historyErr || expireErr) continue

    expired++
  }

  return Response.json({ processed, expired, date: today })
}
