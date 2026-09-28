-- Recording attribution: the workspace whose coach recorded each timeline entry.
ALTER TABLE session_timeline_entries ADD COLUMN recorded_workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE timeline_entries ADD COLUMN recorded_workspace_id UUID REFERENCES workspaces(id);

-- Backfill coach-recorded rows: prefer the event's host workspace, then an accepted
-- fixture workspace, then the recorder's earliest membership. Public rows stay NULL.
UPDATE session_timeline_entries ste
SET recorded_workspace_id = (
  SELECT wm.workspace_id
  FROM workspace_members wm
  WHERE wm.user_id = ste.recorded_by
  ORDER BY ((SELECT e.workspace_id FROM events e WHERE e.id = ste.event_id) = wm.workspace_id) DESC,
           EXISTS (SELECT 1 FROM event_fixture_workspaces fw
                   WHERE fw.event_id = ste.event_id AND fw.workspace_id = wm.workspace_id
                     AND fw.status = 'accepted') DESC,
           wm.created_at, wm.workspace_id
  LIMIT 1)
WHERE ste.recorded_by IS NOT NULL AND ste.recorded_workspace_id IS NULL;

UPDATE timeline_entries te
SET recorded_workspace_id = (
  SELECT wm.workspace_id
  FROM workspace_members wm
  WHERE wm.user_id = te.recorded_by
  ORDER BY ((SELECT e.workspace_id FROM events e WHERE e.id = te.event_id) = wm.workspace_id) DESC,
           EXISTS (SELECT 1 FROM event_fixture_workspaces fw
                   WHERE fw.event_id = te.event_id AND fw.workspace_id = wm.workspace_id
                     AND fw.status = 'accepted') DESC,
           wm.created_at, wm.workspace_id
  LIMIT 1)
WHERE te.recorded_by IS NOT NULL AND te.recorded_workspace_id IS NULL;
