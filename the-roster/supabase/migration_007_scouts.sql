-- Migration 007 — scouts table + label_events constraint update

CREATE TABLE scouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id     uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  artist_id    uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  started_at   date NOT NULL DEFAULT CURRENT_DATE,
  completes_at date NOT NULL,
  completed_at date,
  is_discovery boolean NOT NULL DEFAULT false,
  UNIQUE (label_id, artist_id)
);

CREATE INDEX ON scouts (label_id, completed_at);

ALTER TABLE scouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scouts: own label" ON scouts
  FOR ALL USING (auth.uid() = label_id) WITH CHECK (auth.uid() = label_id);

-- Extend label_events to include scout_completed
ALTER TABLE label_events DROP CONSTRAINT label_events_event_type_check;
ALTER TABLE label_events ADD CONSTRAINT label_events_event_type_check
  CHECK (event_type IN (
    'royalty_paid','artist_signed','contract_expired','tier_up','scout_completed'
  ));
