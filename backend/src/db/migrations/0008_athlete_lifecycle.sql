ALTER TABLE athletes
  ADD COLUMN lifecycle_status TEXT,
  ADD COLUMN status_changed_at TIMESTAMPTZ,
  ADD COLUMN status_changed_by UUID REFERENCES users(id);

UPDATE athletes
SET lifecycle_status = CASE WHEN archived_at IS NULL THEN 'active' ELSE 'archived' END,
    status_changed_at = COALESCE(archived_at, created_at);

ALTER TABLE athletes
  ALTER COLUMN lifecycle_status SET NOT NULL,
  ALTER COLUMN lifecycle_status SET DEFAULT 'active',
  ALTER COLUMN status_changed_at SET NOT NULL,
  ALTER COLUMN status_changed_at SET DEFAULT now(),
  ADD CONSTRAINT athletes_lifecycle_status_check
    CHECK (lifecycle_status IN ('active', 'inactive', 'archived'));

CREATE INDEX athletes_workspace_lifecycle_status_idx
  ON athletes (workspace_id, lifecycle_status, lower(name));

CREATE TABLE athlete_status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('active', 'inactive', 'archived')),
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (athlete_id, workspace_id)
    REFERENCES athletes(id, workspace_id) ON DELETE CASCADE,
  CHECK (from_status IS NULL OR from_status IN ('active', 'inactive', 'archived'))
);
CREATE INDEX athlete_status_transitions_athlete_changed_idx
  ON athlete_status_transitions (athlete_id, changed_at DESC);

CREATE TABLE event_participant_status_reviews (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  transition_id UUID NOT NULL REFERENCES athlete_status_transitions(id) ON DELETE CASCADE,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('active', 'inactive', 'archived')),
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, athlete_id)
);
CREATE INDEX event_participant_status_reviews_pending_idx
  ON event_participant_status_reviews (event_id, flagged_at DESC)
  WHERE acknowledged_at IS NULL;
