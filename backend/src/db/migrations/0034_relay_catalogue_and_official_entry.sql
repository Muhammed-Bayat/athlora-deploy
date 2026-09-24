-- Relay catalogue (4x400m) and coach-selected official entry for session results.
INSERT INTO discipline_definitions (code, version, kind, unit, direction, default_rules, precision, presentation, source)
VALUES
  ('4x400m', 1, 'relay', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"relay","teamSize":4}', 2, '{"label":"4 × 400m relay","unitLabel":"s"}', '0034_relay_catalogue');

ALTER TABLE session_results
  ADD COLUMN selected_entry_id UUID REFERENCES session_timeline_entries(id) ON DELETE RESTRICT;
