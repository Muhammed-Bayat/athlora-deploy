-- Keep source history in place; a selection must belong to the exact target.
ALTER TABLE session_timeline_entries ADD CONSTRAINT session_entry_target_unique
  UNIQUE (id, event_id, session_id, entrant_id, workspace_id);
ALTER TABLE session_results ADD CONSTRAINT selected_entry_target_fk
  FOREIGN KEY (selected_entry_id, event_id, session_id, entrant_id, workspace_id)
  REFERENCES session_timeline_entries(id, event_id, session_id, entrant_id, workspace_id);
ALTER TABLE session_results ADD COLUMN final_place INTEGER CHECK (final_place > 0);
ALTER TABLE discipline_sessions
  ADD COLUMN result_state TEXT NOT NULL DEFAULT 'provisional'
    CHECK (result_state IN ('provisional', 'final', 'reopened'));
ALTER TABLE discipline_sessions ADD CONSTRAINT final_session_completed
  CHECK (result_state <> 'final' OR status = 'completed');
-- Historical completions require review under the official-selection policy.
-- They remain completed/locked until explicitly reopened; no automatic time selection.
