-- Keep the earliest membership for users that predate the one-club rule.
DELETE FROM workspace_members newer
USING workspace_members older
WHERE newer.user_id = older.user_id
  AND (newer.created_at, newer.workspace_id) > (older.created_at, older.workspace_id);

ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_user_id_key UNIQUE (user_id);

-- Legacy email invitations remain valid; new club-targeted invitations do not need one.
ALTER TABLE fixture_invitations
  ALTER COLUMN email DROP NOT NULL;

CREATE INDEX fixture_invitations_target_workspace_active_idx
  ON fixture_invitations (event_id, target_workspace_id, expires_at)
  WHERE target_workspace_id IS NOT NULL
    AND status IN ('pending', 'change_requested');
