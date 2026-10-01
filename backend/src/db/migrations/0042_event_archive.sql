ALTER TABLE events
  ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX events_workspace_archived_idx
  ON events (workspace_id, archived_at, date)
  WHERE archived_at IS NOT NULL;
