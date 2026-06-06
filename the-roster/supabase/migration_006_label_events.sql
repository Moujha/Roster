-- Migration 006 — label_events: activity feed log
CREATE TABLE label_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id    uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  event_type  text NOT NULL
                CHECK (event_type IN ('royalty_paid','artist_signed','contract_expired','tier_up')),
  artist_name text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON label_events (label_id, created_at DESC);

ALTER TABLE label_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "label_events: own label" ON label_events
  FOR ALL USING (auth.uid() = label_id) WITH CHECK (auth.uid() = label_id);
