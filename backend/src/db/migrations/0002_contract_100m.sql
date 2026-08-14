-- 0002: 100m data/API contract
-- Forward-only. Fixes the MVP discipline at the API/service boundary (100m,
-- seconds) while keeping the schema permissive so later disciplines can be added
-- by future migrations without dropping these constraints.

-- athletes: archival state. Archived = non-null; complements soft deletes.
ALTER TABLE athletes
  ADD COLUMN archived_at TIMESTAMPTZ;

-- events: standard lifecycle states + type domain, with lookup indexes.
ALTER TABLE events
  ADD CONSTRAINT events_status_check CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  ADD CONSTRAINT events_type_check CHECK (type IN ('competition', 'training'));

CREATE INDEX idx_events_created_by ON events (created_by);
CREATE INDEX idx_events_status_date ON events (status, date);

-- event_participants: RSVP domain; PK leads with event_id so index athlete_id.
ALTER TABLE event_participants
  ADD CONSTRAINT event_participants_rsvp_status_check CHECK (rsvp_status IN ('pending', 'yes', 'no'));

CREATE INDEX idx_event_participants_athlete_id ON event_participants (athlete_id);

-- timeline_entries: domain constraints + free-text note storage for 'note' entries.
ALTER TABLE timeline_entries
  ADD COLUMN note_text TEXT,
  ADD CONSTRAINT timeline_entries_entry_type_check CHECK (entry_type IN ('attempt', 'split', 'penalty', 'note')),
  ADD CONSTRAINT timeline_entries_incident_type_check CHECK (incident_type IN ('false_start', 'dq', 'dnf', 'dns', 'lane_infringement')),
  ADD CONSTRAINT timeline_entries_unit_check CHECK (unit IN ('seconds', 'metres', 'cm')),
  ADD CONSTRAINT timeline_entries_value_nonnegative_check CHECK (value IS NULL OR value >= 0);

CREATE INDEX idx_timeline_entries_event_athlete_discipline
  ON timeline_entries (event_id, athlete_id, discipline);

-- results: derived outcome distinguishes no result / valid finish / DQ / DNF / DNS,
-- plus override audit timestamp. Each outcome's value shape is pinned by constraints:
-- voided outcomes carry no value, valid finishes must, no_result carries none.
ALTER TABLE results
  ADD COLUMN outcome TEXT NOT NULL DEFAULT 'no_result',
  ADD COLUMN override_at TIMESTAMPTZ,
  ADD CONSTRAINT results_outcome_check CHECK (outcome IN ('no_result', 'valid', 'dq', 'dnf', 'dns')),
  ADD CONSTRAINT results_final_result_nonnegative_check CHECK (final_result IS NULL OR final_result >= 0),
  ADD CONSTRAINT results_manual_override_nonnegative_check CHECK (manual_override IS NULL OR manual_override >= 0),
  ADD CONSTRAINT results_placing_positive_check CHECK ("placing" IS NULL OR "placing" > 0),
  ADD CONSTRAINT results_voided_has_no_value_check CHECK (outcome NOT IN ('dq', 'dnf', 'dns') OR final_result IS NULL),
  ADD CONSTRAINT results_valid_has_value_check CHECK (outcome <> 'valid' OR final_result IS NOT NULL),
  ADD CONSTRAINT results_no_result_has_no_value_check CHECK (outcome <> 'no_result' OR final_result IS NULL);
