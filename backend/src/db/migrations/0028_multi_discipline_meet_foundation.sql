-- Additive foundation. Historical 100m tables and rows are not converted.
CREATE TABLE discipline_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_]*$'),
  version INTEGER NOT NULL CHECK (version > 0),
  kind TEXT NOT NULL CHECK (kind IN ('track', 'field', 'relay', 'vertical')),
  unit TEXT NOT NULL CHECK (unit IN ('seconds', 'metres', 'cm')),
  direction TEXT NOT NULL CHECK (direction IN ('lower', 'higher')),
  default_rules JSONB NOT NULL CHECK (
    jsonb_typeof(default_rules) = 'object'
    AND default_rules ? 'aggregation'
    AND default_rules->>'aggregation' IN ('timed', 'best')
    AND default_rules ? 'entrantType'
    AND default_rules->>'entrantType' IN ('individual', 'relay')
  ),
  precision INTEGER NOT NULL CHECK (precision BETWEEN 0 AND 6),
  presentation JSONB NOT NULL CHECK (jsonb_typeof(presentation) = 'object' AND presentation ? 'label'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  UNIQUE (code, version),
  CHECK ((unit = 'seconds' AND direction = 'lower') OR (unit IN ('metres', 'cm') AND direction = 'higher'))
);

INSERT INTO discipline_definitions (code, version, kind, unit, direction, default_rules, precision, presentation, source)
VALUES
  ('100m', 1, 'track', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"individual"}', 2, '{"label":"100m","unitLabel":"s"}', '0028_multi_discipline_meet_foundation'),
  ('long_jump', 1, 'field', 'metres', 'higher', '{"aggregation":"best","entrantType":"individual"}', 2, '{"label":"Long jump","unitLabel":"m"}', '0028_multi_discipline_meet_foundation'),
  ('4x100m', 1, 'relay', 'seconds', 'lower', '{"aggregation":"timed","entrantType":"relay","teamSize":4}', 2, '{"label":"4 × 100m relay","unitLabel":"s"}', '0028_multi_discipline_meet_foundation');

CREATE OR REPLACE FUNCTION prevent_discipline_definition_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Discipline definitions are immutable; insert a new version';
END;
$$;
CREATE TRIGGER discipline_definitions_immutable BEFORE UPDATE OR DELETE ON discipline_definitions
  FOR EACH ROW EXECUTE FUNCTION prevent_discipline_definition_change();

ALTER TABLE events ADD CONSTRAINT events_id_workspace_unique UNIQUE (id, workspace_id);

CREATE TABLE discipline_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  discipline_definition_id UUID NOT NULL REFERENCES discipline_definitions(id) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, event_id),
  FOREIGN KEY (event_id, workspace_id) REFERENCES events(id, workspace_id) ON DELETE RESTRICT
);
CREATE INDEX discipline_sessions_event_idx ON discipline_sessions(event_id, created_at, id);

CREATE TABLE meet_entrants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('athlete', 'guest', 'relay')),
  athlete_id UUID,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, event_id, workspace_id),
  UNIQUE (id, event_id, workspace_id, kind),
  FOREIGN KEY (event_id, workspace_id) REFERENCES event_fixture_workspaces(event_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (athlete_id, workspace_id) REFERENCES athletes(id, workspace_id) ON DELETE RESTRICT,
  CHECK ((kind = 'athlete') = (athlete_id IS NOT NULL))
);
CREATE UNIQUE INDEX meet_entrants_athlete_unique ON meet_entrants(event_id, athlete_id) WHERE athlete_id IS NOT NULL;
CREATE INDEX meet_entrants_workspace_idx ON meet_entrants(workspace_id, event_id);

CREATE TABLE relay_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  relay_id UUID NOT NULL,
  relay_kind TEXT NOT NULL DEFAULT 'relay' CHECK (relay_kind = 'relay'),
  member_id UUID NOT NULL,
  member_kind TEXT NOT NULL CHECK (member_kind IN ('athlete', 'guest')),
  leg INTEGER NOT NULL CHECK (leg > 0),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (relay_id, leg),
  UNIQUE (relay_id, member_id),
  FOREIGN KEY (relay_id, event_id, workspace_id, relay_kind) REFERENCES meet_entrants(id, event_id, workspace_id, kind) ON DELETE RESTRICT,
  FOREIGN KEY (member_id, event_id, workspace_id, member_kind) REFERENCES meet_entrants(id, event_id, workspace_id, kind) ON DELETE RESTRICT
);

CREATE TABLE session_entrants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  session_id UUID NOT NULL,
  entrant_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  withdrawn_at TIMESTAMPTZ,
  withdrawn_by UUID REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, entrant_id),
  UNIQUE (event_id, session_id, entrant_id),
  UNIQUE (event_id, session_id, entrant_id, workspace_id),
  FOREIGN KEY (session_id, event_id) REFERENCES discipline_sessions(id, event_id) ON DELETE RESTRICT,
  FOREIGN KEY (entrant_id, event_id, workspace_id) REFERENCES meet_entrants(id, event_id, workspace_id) ON DELETE RESTRICT,
  CHECK ((withdrawn_at IS NULL) = (withdrawn_by IS NULL))
);

CREATE TABLE session_timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  session_id UUID NOT NULL,
  entrant_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('attempt', 'split', 'penalty', 'note')),
  value NUMERIC CHECK (value > 0 AND value <> 'NaN'::numeric AND value <> 'Infinity'::numeric),
  unit TEXT CHECK (unit IN ('seconds', 'metres', 'cm')),
  is_foul BOOLEAN NOT NULL DEFAULT false,
  incident_type TEXT CHECK (incident_type IN ('false_start', 'dq', 'dnf', 'dns', 'lane_infringement')),
  note_text TEXT CHECK (length(note_text) <= 2000),
  recorded_by UUID REFERENCES users(id),
  public_logger_session_id UUID,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (event_id, session_id, entrant_id, workspace_id) REFERENCES session_entrants(event_id, session_id, entrant_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (public_logger_session_id, event_id) REFERENCES public_logger_sessions(id, event_id) ON DELETE RESTRICT,
  CHECK ((recorded_by IS NULL) <> (public_logger_session_id IS NULL)),
  CHECK ((value IS NULL) = (unit IS NULL)),
  CHECK (entry_type <> 'attempt' OR value IS NOT NULL OR is_foul OR incident_type IS NOT NULL)
);
CREATE INDEX session_timeline_target_idx ON session_timeline_entries(session_id, entrant_id, created_at, id);

CREATE TABLE session_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  session_id UUID NOT NULL,
  entrant_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('no_result', 'valid', 'dq', 'dnf', 'dns')),
  final_result NUMERIC CHECK (final_result > 0 AND final_result <> 'NaN'::numeric AND final_result <> 'Infinity'::numeric),
  unit TEXT NOT NULL CHECK (unit IN ('seconds', 'metres', 'cm')),
  manual_override NUMERIC CHECK (manual_override > 0 AND manual_override <> 'NaN'::numeric AND manual_override <> 'Infinity'::numeric),
  override_reason TEXT,
  overridden_by UUID REFERENCES users(id),
  override_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, entrant_id),
  FOREIGN KEY (event_id, session_id, entrant_id, workspace_id) REFERENCES session_entrants(event_id, session_id, entrant_id, workspace_id) ON DELETE RESTRICT,
  CHECK ((outcome = 'valid') = (final_result IS NOT NULL)),
  CHECK ((manual_override IS NULL AND override_reason IS NULL AND overridden_by IS NULL AND override_at IS NULL)
    OR (manual_override IS NOT NULL AND override_reason IS NOT NULL AND length(trim(override_reason)) > 0 AND overridden_by IS NOT NULL AND override_at IS NOT NULL))
);
CREATE INDEX session_results_workspace_idx ON session_results(workspace_id, entrant_id, session_id);

CREATE TABLE meet_domain_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES users(id),
  public_logger_session_id UUID,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, workspace_id) REFERENCES event_fixture_workspaces(event_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (public_logger_session_id, event_id) REFERENCES public_logger_sessions(id, event_id) ON DELETE RESTRICT,
  CHECK ((actor_id IS NULL) <> (public_logger_session_id IS NULL))
);
CREATE INDEX meet_domain_audit_entity_idx ON meet_domain_audit(event_id, entity_id, created_at);

ALTER TABLE sync_action_receipts
  ADD COLUMN discipline_session_id UUID,
  ADD COLUMN entrant_id UUID,
  ADD CONSTRAINT sync_session_target_pair CHECK ((discipline_session_id IS NULL) = (entrant_id IS NULL)),
  ADD CONSTRAINT sync_session_target_fk FOREIGN KEY (event_id, discipline_session_id, entrant_id)
    REFERENCES session_entrants(event_id, session_id, entrant_id);
ALTER TABLE public_sync_action_receipts
  ADD COLUMN discipline_session_id UUID,
  ADD COLUMN entrant_id UUID,
  ADD CONSTRAINT public_sync_session_target_pair CHECK ((discipline_session_id IS NULL) = (entrant_id IS NULL)),
  ADD CONSTRAINT public_sync_session_target_fk FOREIGN KEY (event_id, discipline_session_id, entrant_id)
    REFERENCES session_entrants(event_id, session_id, entrant_id);
ALTER TABLE public_sync_conflict_log
  ADD COLUMN discipline_session_id UUID,
  ADD COLUMN entrant_id UUID,
  ADD CONSTRAINT public_conflict_session_target_pair CHECK ((discipline_session_id IS NULL) = (entrant_id IS NULL)),
  ADD CONSTRAINT public_conflict_session_target_fk FOREIGN KEY (event_id, discipline_session_id, entrant_id)
    REFERENCES session_entrants(event_id, session_id, entrant_id);
