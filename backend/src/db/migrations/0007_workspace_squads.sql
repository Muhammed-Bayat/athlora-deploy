CREATE TABLE squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX squads_workspace_name_key ON squads (workspace_id, lower(name));
CREATE UNIQUE INDEX squads_id_workspace_id_key ON squads (id, workspace_id);
CREATE INDEX squads_workspace_active_idx ON squads (workspace_id, archived_at, lower(name));
CREATE UNIQUE INDEX athletes_id_workspace_id_key ON athletes (id, workspace_id);

CREATE TABLE athlete_squads (
  workspace_id UUID NOT NULL,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  squad_id UUID NOT NULL REFERENCES squads(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, squad_id),
  FOREIGN KEY (athlete_id, workspace_id) REFERENCES athletes(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (squad_id, workspace_id) REFERENCES squads(id, workspace_id) ON DELETE RESTRICT
);
CREATE INDEX athlete_squads_squad_id_idx ON athlete_squads (squad_id, athlete_id);

-- Preserve the legacy column for rollback-era compatibility, but migrate all
-- nonblank values into workspace-owned normalized memberships exactly once.
INSERT INTO squads (workspace_id, name)
SELECT workspace_id, btrim(squad)
FROM athletes
WHERE squad IS NOT NULL AND btrim(squad) <> ''
GROUP BY workspace_id, btrim(squad)
ON CONFLICT (workspace_id, lower(name)) DO NOTHING;

INSERT INTO athlete_squads (workspace_id, athlete_id, squad_id)
SELECT a.workspace_id, a.id, s.id
FROM athletes a
JOIN squads s ON s.workspace_id = a.workspace_id AND lower(s.name) = lower(btrim(a.squad))
WHERE a.squad IS NOT NULL AND btrim(a.squad) <> ''
ON CONFLICT DO NOTHING;
