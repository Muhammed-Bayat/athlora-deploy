-- 0003: athlete statistics and dashboard aggregate lookup indexes

CREATE INDEX idx_results_athlete_discipline_event
  ON results (athlete_id, discipline, event_id);

CREATE INDEX idx_events_owner_status_date_order
  ON events (created_by, status, date, time, created_at, id);

CREATE INDEX idx_timeline_entries_event_active_recent
  ON timeline_entries (event_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
