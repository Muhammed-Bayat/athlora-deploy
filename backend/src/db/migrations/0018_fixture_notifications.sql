CREATE TABLE fixture_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invitation_id UUID REFERENCES fixture_invitations(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fixture_invited', 'fixture_responded', 'fixture_reacceptance_required', 'fixture_started')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipient_user_id, workspace_id, dedupe_key)
);

CREATE INDEX fixture_notifications_unread_idx
  ON fixture_notifications (recipient_user_id, workspace_id, created_at DESC)
  WHERE read_at IS NULL;
