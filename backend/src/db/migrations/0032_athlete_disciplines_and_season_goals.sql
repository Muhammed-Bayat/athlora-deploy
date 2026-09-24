CREATE TABLE athlete_preferred_disciplines (
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  discipline_definition_id UUID NOT NULL REFERENCES discipline_definitions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, discipline_definition_id)
);

CREATE TABLE athlete_season_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  discipline_definition_id UUID NOT NULL REFERENCES discipline_definitions(id) ON DELETE RESTRICT,
  target_value NUMERIC NOT NULL,
  target_unit TEXT NOT NULL CHECK (target_unit IN ('seconds', 'metres', 'cm')),
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_value > 0)
);

CREATE INDEX athlete_season_goals_athlete_idx ON athlete_season_goals(athlete_id, status, target_date, created_at);
