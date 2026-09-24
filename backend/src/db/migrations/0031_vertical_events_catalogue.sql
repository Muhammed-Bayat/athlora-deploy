-- Keep immutable definitions and existing session/entrant/audit identities.
ALTER TABLE discipline_definitions DROP CONSTRAINT discipline_definitions_default_rules_check;
ALTER TABLE discipline_definitions ADD CONSTRAINT discipline_definitions_default_rules_check CHECK (
  jsonb_typeof(default_rules) = 'object' AND default_rules ? 'aggregation'
  AND default_rules->>'aggregation' IN ('timed','best','vertical')
  AND default_rules ? 'entrantType' AND default_rules->>'entrantType' IN ('individual','relay')
);
INSERT INTO discipline_definitions (code, version, kind, unit, direction, default_rules, precision, presentation, source) VALUES
('high_jump',1,'vertical','metres','higher','{"aggregation":"vertical","entrantType":"individual","failureLimit":3,"heightIncrement":0.02,"round":"final"}',2,'{"label":"High Jump","unitLabel":"m"}','0031_vertical_events_catalogue'),
('pole_vault',1,'vertical','metres','higher','{"aggregation":"vertical","entrantType":"individual","failureLimit":3,"heightIncrement":0.05,"round":"final"}',2,'{"label":"Pole Vault","unitLabel":"m"}','0031_vertical_events_catalogue');
ALTER TABLE discipline_sessions ADD COLUMN vertical_config JSONB CHECK (vertical_config IS NULL OR jsonb_typeof(vertical_config) = 'object');
ALTER TABLE session_timeline_entries ADD COLUMN vertical_state TEXT CHECK (vertical_state IN ('clearance','failure','pass','void'));
ALTER TABLE session_timeline_entries ADD COLUMN attempt_order INTEGER CHECK (attempt_order > 0);
ALTER TABLE session_timeline_entries ADD CONSTRAINT vertical_attempt_shape CHECK (
  vertical_state IS NULL OR (entry_type = 'attempt' AND value IS NOT NULL AND unit = 'metres' AND NOT is_foul AND incident_type IS NULL AND attempt_order IS NOT NULL)
);
CREATE UNIQUE INDEX vertical_attempt_order_unique ON session_timeline_entries(session_id, entrant_id, attempt_order) WHERE attempt_order IS NOT NULL;
