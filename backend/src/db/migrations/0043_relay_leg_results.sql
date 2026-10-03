-- Per-athlete relay leg results: member-scoped timeline entries plus the official selection per leg.
ALTER TABLE session_timeline_entries
  ADD COLUMN relay_member_id UUID REFERENCES relay_members(id) ON DELETE RESTRICT;

ALTER TABLE relay_members ADD CONSTRAINT relay_members_id_relay_uq UNIQUE (id, relay_id);

CREATE TABLE session_relay_selections (
  event_id UUID NOT NULL,
  session_id UUID NOT NULL,
  entrant_id UUID NOT NULL,
  relay_member_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  entry_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, relay_member_id),
  FOREIGN KEY (relay_member_id, entrant_id) REFERENCES relay_members(id, relay_id) ON DELETE RESTRICT,
  FOREIGN KEY (entry_id, event_id, session_id, entrant_id, workspace_id)
    REFERENCES session_timeline_entries(id, event_id, session_id, entrant_id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (event_id, session_id, entrant_id, workspace_id)
    REFERENCES session_entrants(event_id, session_id, entrant_id, workspace_id) ON DELETE RESTRICT
);

CREATE INDEX session_relay_selections_target_idx ON session_relay_selections(event_id, session_id, entrant_id);
