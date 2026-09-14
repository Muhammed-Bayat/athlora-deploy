-- Audited RSVP state, including uncertain availability.
ALTER TABLE event_participants
  DROP CONSTRAINT event_participants_rsvp_status_check,
  ADD CONSTRAINT event_participants_rsvp_status_check CHECK (rsvp_status IN ('pending', 'yes', 'no', 'maybe')),
  ADD COLUMN rsvp_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN rsvp_updated_by UUID REFERENCES users(id);

CREATE TABLE event_participant_rsvp_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  athlete_id UUID NOT NULL,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  batch_id UUID
);

CREATE INDEX idx_event_participant_rsvp_audit_event_athlete ON event_participant_rsvp_audit(event_id, athlete_id, changed_at DESC);
