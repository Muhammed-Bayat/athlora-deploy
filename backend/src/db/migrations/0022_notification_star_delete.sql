ALTER TABLE fixture_notifications
  ADD COLUMN starred_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX fixture_notifications_starred_idx
  ON fixture_notifications (recipient_user_id, workspace_id, created_at DESC)
  WHERE starred_at IS NOT NULL AND deleted_at IS NULL;
