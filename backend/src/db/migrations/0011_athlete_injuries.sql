CREATE TABLE athlete_injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL,
  body_region TEXT NOT NULL CHECK (body_region IN ('Head & Neck', 'Torso', 'Arm', 'Leg')),
  area TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('Left', 'Right', 'Both', 'Center')),
  severity TEXT NOT NULL CHECK (severity IN ('Minor', 'Moderate', 'Severe')),
  notes TEXT,
  occurrence_date DATE NOT NULL,
  expected_return_date DATE,
  resolved_date TIMESTAMPTZ,
  resolution_notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES users(id),
  FOREIGN KEY (athlete_id, workspace_id)
    REFERENCES athletes(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT athlete_injuries_dates_check
    CHECK (
      (expected_return_date IS NULL OR expected_return_date >= occurrence_date) AND
      (resolved_date IS NULL OR resolved_date::date >= occurrence_date)
    )
);

CREATE INDEX athlete_injuries_workspace_athlete_idx
  ON athlete_injuries (workspace_id, athlete_id, occurrence_date DESC);

CREATE INDEX athlete_injuries_active_idx
  ON athlete_injuries (athlete_id)
  WHERE deleted_at IS NULL AND resolved_date IS NULL;
