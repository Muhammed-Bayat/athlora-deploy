CREATE TABLE event_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  event_id UUID NOT NULL REFERENCES events(id),
  event_version INTEGER NOT NULL DEFAULT 1,
  threshold TEXT NOT NULL CHECK (threshold IN ('seven_days', 'one_day')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  invalidated_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id, event_version, threshold)
);
CREATE INDEX idx_event_reminders_unread ON event_reminders(user_id, workspace_id, created_at DESC) WHERE read_at IS NULL AND invalidated_at IS NULL;
CREATE TABLE event_reminder_mutes (
  user_id UUID NOT NULL REFERENCES users(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  event_id UUID NOT NULL REFERENCES events(id),
  muted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id, event_id)
);
