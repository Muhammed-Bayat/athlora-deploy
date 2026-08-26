-- Workspaces are the authorization boundary. Existing creator columns remain audit attribution.
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC' CHECK (timezone ~ '^[A-Za-z_]+/[A-Za-z_]+(?:/[A-Za-z_]+)?$|^UTC$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'coach' CHECK (role IN ('coach', 'assistant', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE athletes ADD COLUMN workspace_id UUID;
ALTER TABLE events ADD COLUMN workspace_id UUID;
ALTER TABLE events ADD COLUMN timezone TEXT;

-- Preserve all historical IDs and records by assigning every legacy user one workspace.
INSERT INTO workspaces (id, name, timezone)
SELECT u.id, CONCAT(u.name, '''s workspace'), 'UTC'
FROM users u;

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT u.id, u.id, u.role
FROM users u;

UPDATE athletes SET workspace_id = coach_id WHERE workspace_id IS NULL;
UPDATE events SET workspace_id = created_by WHERE workspace_id IS NULL;

ALTER TABLE athletes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE athletes ADD CONSTRAINT athletes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE events ADD CONSTRAINT events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);

CREATE INDEX athletes_workspace_id_idx ON athletes(workspace_id);
CREATE INDEX events_workspace_id_idx ON events(workspace_id);
CREATE INDEX workspace_members_user_id_idx ON workspace_members(user_id, workspace_id);
