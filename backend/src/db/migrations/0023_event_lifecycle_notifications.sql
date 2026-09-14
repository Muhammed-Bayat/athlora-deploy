ALTER TABLE fixture_notifications DROP CONSTRAINT fixture_notifications_kind_check;

ALTER TABLE fixture_notifications ADD CONSTRAINT fixture_notifications_kind_check
  CHECK (kind IN ('fixture_invited', 'fixture_responded', 'fixture_reacceptance_required', 'fixture_started', 'event_coming_up', 'live_logger_started', 'event_ended'));
