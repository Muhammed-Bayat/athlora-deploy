-- Idempotency receipts for offline sync batches
CREATE TABLE IF NOT EXISTS sync_action_receipts (
  action_id       UUID PRIMARY KEY,
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  actor_id        UUID NOT NULL REFERENCES users(id),
  device_id       TEXT NOT NULL,
  action_type     TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'duplicate')),
  entry_id        UUID,
  server_version  INT,
  error_code      TEXT,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_action_receipts_event_device
  ON sync_action_receipts (event_id, device_id, action_id);
