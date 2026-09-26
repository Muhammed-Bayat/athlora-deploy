-- Keep every offline conflict available for a coach decision without altering source observations.
ALTER TABLE sync_action_receipts ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ;
ALTER TABLE public_sync_action_receipts ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ;

CREATE TABLE offline_sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discipline_session_id UUID,
  entrant_id UUID,
  entry_id UUID,
  actor_id UUID REFERENCES users(id),
  public_logger_session_id UUID REFERENCES public_logger_sessions(id),
  device_id TEXT NOT NULL,
  action_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  expected_version INTEGER,
  actual_version INTEGER,
  attempted_payload JSONB NOT NULL,
  canonical_state JSONB,
  client_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_reason TEXT,
  CHECK ((actor_id IS NULL) <> (public_logger_session_id IS NULL)),
  CHECK ((discipline_session_id IS NULL) = (entrant_id IS NULL))
);

CREATE INDEX offline_sync_conflicts_resolution_idx
  ON offline_sync_conflicts (event_id, discipline_session_id, created_at);
