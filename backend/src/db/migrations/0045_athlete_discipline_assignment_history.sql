-- Append-only history of every discipline ever assigned to an athlete.
-- athlete_preferred_disciplines stays delete/reinsert (it answers "currently
-- assigned"); this table answers "assigned at some point", so the athlete
-- performance log keeps showing disciplines that were later unassigned.
CREATE TABLE athlete_discipline_assignments (
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  discipline_definition_id UUID NOT NULL REFERENCES discipline_definitions(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, discipline_definition_id)
);

CREATE INDEX athlete_discipline_assignments_discipline_idx
  ON athlete_discipline_assignments (discipline_definition_id);

INSERT INTO athlete_discipline_assignments (athlete_id, discipline_definition_id)
SELECT athlete_id, discipline_definition_id FROM athlete_preferred_disciplines
ON CONFLICT DO NOTHING;
