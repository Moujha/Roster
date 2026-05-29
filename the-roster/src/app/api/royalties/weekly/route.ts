import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const weekStart = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10)

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, label_id, artist_id, rev_split_label_pct')
    .eq('status', 'active')

  if (!contracts?.length) return Response.json({ processed: 0, date: today })

  let processed = 0
  for (const c of contracts) {
    const { data: rows } = await supabase
      .from('artist_stats_daily')
      .select('daily_streams_top10')
      .eq('artist_id', c.artist_id)
      .gte('date', weekStart)
      .lte('date', today)
      .not('daily_streams_top10', 'is', null)

    const weeklyStreams = (rows ?? []).reduce((s, r) => s + (r.daily_streams_top10 ?? 0), 0)
    if (weeklyStreams === 0) continue

    const royalties = Math.round(weeklyStreams * 0.035 * (c.rev_split_label_pct / 100) * 100) / 100

    const [{ data: contract }, { data: label }] = await Promise.all([
      supabase.from('contracts').select('royalties_earned').eq('id', c.id).single(),
      supabase.from('labels').select('treasury').eq('id', c.label_id).single(),
    ])

    await Promise.all([
      supabase.from('contracts').update({ royalties_earned: (contract?.royalties_earned ?? 0) + royalties }).eq('id', c.id),
      supabase.from('labels').update({ treasury: (label?.treasury ?? 0) + royalties }).eq('id', c.label_id),
    ])
    processed++
  }

  return Response.json({ processed, date: today })
}
