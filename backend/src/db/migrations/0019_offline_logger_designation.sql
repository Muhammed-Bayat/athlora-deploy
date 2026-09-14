-- Add offline logger designation columns to event_helper_grants
ALTER TABLE event_helper_grants
  ADD COLUMN IF NOT EXISTS is_offline_logger BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offline_queue_device_id TEXT;

-- One offline logger per event (partial unique index on active grants only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_offline_logger_per_event
  ON event_helper_grants (event_id)
  WHERE is_offline_logger = true AND status = 'active';
