-- Migration 011: leaderboard function + label_events constraint fix

-- Fix CHECK constraint to allow release_boost events
ALTER TABLE label_events DROP CONSTRAINT label_events_event_type_check;
ALTER TABLE label_events ADD CONSTRAINT label_events_event_type_check
  CHECK (event_type IN (
    'royalty_paid','artist_signed','contract_expired','tier_up',
    'scout_completed','release_boost'
  ));

-- Cross-label leaderboard (SECURITY DEFINER bypasses RLS)
-- Returns one row per label with all four ranking metrics.
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  label_id       uuid,
  label_name     text,
  reputation     int,
  revenue_90d    numeric,
  emerging_rev   numeric,
  efficiency     numeric,
  avg_growth_pct numeric
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql AS $$
  SELECT
    l.id,
    l.label_name,
    l.reputation,

    -- §8.1 Primary: rolling 90-day royalties from event log
    COALESCE((
      SELECT SUM((le.payload->>'amount')::numeric)
      FROM label_events le
      WHERE le.label_id = l.id
        AND le.event_type = 'royalty_paid'
        AND le.created_at >= NOW() - INTERVAL '90 days'
    ), 0),

    -- §8.2a Emerging: revenue from artists signed with <1M listeners
    COALESCE((
      SELECT SUM(lh.total_royalties)
      FROM label_history lh
      WHERE lh.label_id = l.id
        AND COALESCE(lh.listeners_at_signing, 0) < 1000000
    ), 0)
    + COALESCE((
      SELECT SUM(c.royalties_earned)
      FROM contracts c
      WHERE c.label_id = l.id
        AND c.status = 'active'
        AND COALESCE(c.baseline_listeners, 0) < 1000000
    ), 0),

    -- §8.2b Efficiency: total royalties / total cost
    CASE WHEN COALESCE((
        SELECT SUM(lh.signing_bonus + lh.total_dev_spend)
        FROM label_history lh WHERE lh.label_id = l.id
      ), 0) + COALESCE((
        SELECT SUM(c.signing_bonus + c.dev_spend_total)
        FROM contracts c WHERE c.label_id = l.id
      ), 0) > 0
    THEN ROUND(
      (COALESCE((SELECT SUM(lh.total_royalties) FROM label_history lh WHERE lh.label_id = l.id), 0)
       + COALESCE((SELECT SUM(c.royalties_earned) FROM contracts c WHERE c.label_id = l.id), 0))
      /
      (COALESCE((SELECT SUM(lh.signing_bonus + lh.total_dev_spend) FROM label_history lh WHERE lh.label_id = l.id), 0)
       + COALESCE((SELECT SUM(c.signing_bonus + c.dev_spend_total) FROM contracts c WHERE c.label_id = l.id), 0))
    , 4)
    ELSE 0
    END,

    -- §8.2c Talent: avg listener growth % across completed contracts
    COALESCE((
      SELECT ROUND(AVG(
        CASE WHEN lh.listeners_at_signing > 0 AND lh.listeners_at_end IS NOT NULL
          THEN (lh.listeners_at_end - lh.listeners_at_signing)::numeric
               / lh.listeners_at_signing * 100
          ELSE NULL
        END
      ), 1)
      FROM label_history lh
      WHERE lh.label_id = l.id
        AND lh.listeners_at_signing > 0
        AND lh.listeners_at_end IS NOT NULL
    ), 0)

  FROM labels l
  ORDER BY 4 DESC NULLS LAST;  -- default order: 90d revenue
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard() TO authenticated;
