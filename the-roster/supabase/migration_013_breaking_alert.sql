-- Migration 013: add breaking_alert to label_events event_type constraint

ALTER TABLE label_events DROP CONSTRAINT label_events_event_type_check;
ALTER TABLE label_events ADD CONSTRAINT label_events_event_type_check
  CHECK (event_type IN (
    'royalty_paid','artist_signed','contract_expired','tier_up',
    'scout_completed','release_boost','breaking_alert'
  ));
