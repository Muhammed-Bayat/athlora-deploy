-- Track the device used by a public logger session for offline sync audit
ALTER TABLE public_logger_sessions
  ADD COLUMN IF NOT EXISTS offline_device_id TEXT;

-- Idempotent receipts for public logger batch sync (mirrors sync_action_receipts)
CREATE TABLE IF NOT EXISTS public_sync_action_receipts (
  action_id       UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES public_logger_sessions(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'duplicate')),
  entry_id        UUID,
  server_version  INT,
  error_code      TEXT,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_sync_action_receipts_event_device
  ON public_sync_action_receipts (event_id, device_id, action_id);

-- Conflict audit log for last-write-wins resolution
CREATE TABLE IF NOT EXISTS public_sync_conflict_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id       UUID NOT NULL,
  session_id      UUID NOT NULL REFERENCES public_logger_sessions(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entry_id        UUID NOT NULL,
  overwritten_version INT NOT NULL,
  overwritten_value   NUMERIC,
  overwritten_incident TEXT,
  overwritten_note    TEXT,
  winning_action_id   UUID NOT NULL,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_sync_conflict_log_event
  ON public_sync_conflict_log (event_id, logged_at);
