-- Several participating workspaces may share the same fixture status.
DROP INDEX event_fixture_workspaces_event_status_idx;

CREATE INDEX event_fixture_workspaces_event_status_idx
  ON event_fixture_workspaces (event_id, status);
