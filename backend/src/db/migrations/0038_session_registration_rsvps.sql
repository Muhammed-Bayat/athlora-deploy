-- Session rosters carry the same attendance state as the established event roster.
ALTER TABLE session_entrants
  ADD COLUMN rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'yes', 'no', 'maybe')),
  ADD COLUMN rsvp_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN rsvp_updated_by UUID REFERENCES users(id);
