-- A fixture grants a guest workspace access to one hosted competition without
-- turning that workspace into a member of the host's private workspace.
CREATE TABLE event_fixture_workspaces (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('host', 'guest')),
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'reacceptance_required', 'withdrawn')),
  accepted_revision INTEGER NOT NULL DEFAULT 1 CHECK (accepted_revision > 0),
  contact_email TEXT,
  joined_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  withdrawn_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, workspace_id),
  CHECK ((role = 'host' AND contact_email IS NULL) OR (role = 'guest' AND contact_email IS NOT NULL))
);
CREATE UNIQUE INDEX event_fixture_workspaces_one_host_idx
  ON event_fixture_workspaces (event_id) WHERE role = 'host';
CREATE UNIQUE INDEX event_fixture_workspaces_event_status_idx
  ON event_fixture_workspaces (event_id, status);

-- Existing events continue as single-workspace training/competition records.
INSERT INTO event_fixture_workspaces (event_id, workspace_id, role)
SELECT id, workspace_id, 'host'
FROM events;

CREATE FUNCTION create_event_fixture_host() RETURNS trigger AS $$
BEGIN
  INSERT INTO event_fixture_workspaces (event_id, workspace_id, role)
  VALUES (NEW.id, NEW.workspace_id, 'host');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_create_fixture_host
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION create_event_fixture_host();

ALTER TABLE events
  ADD COLUMN fixture_revision INTEGER NOT NULL DEFAULT 1 CHECK (fixture_revision > 0);

CREATE TABLE fixture_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  target_workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'change_requested', 'revoked')),
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL))
);
CREATE INDEX fixture_invitations_event_created_idx
  ON fixture_invitations (event_id, created_at DESC);
CREATE INDEX fixture_invitations_email_active_idx
  ON fixture_invitations (lower(email), expires_at)
  WHERE status IN ('pending', 'change_requested');

CREATE TABLE fixture_invitation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES fixture_invitations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT,
  response TEXT NOT NULL CHECK (response IN ('accepted', 'declined', 'change_requested')),
  message TEXT,
  responded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((response = 'change_requested') = (message IS NOT NULL))
);
CREATE INDEX fixture_invitation_responses_invitation_created_idx
  ON fixture_invitation_responses (invitation_id, created_at);

ALTER TABLE event_participants
  ADD COLUMN participant_workspace_id UUID;

UPDATE event_participants ep
SET participant_workspace_id = a.workspace_id
FROM athletes a
WHERE a.id = ep.athlete_id;

ALTER TABLE event_participants
  ALTER COLUMN participant_workspace_id SET NOT NULL,
  ADD CONSTRAINT event_participants_athlete_workspace_fkey
    FOREIGN KEY (athlete_id, participant_workspace_id)
    REFERENCES athletes(id, workspace_id) ON DELETE RESTRICT,
  ADD CONSTRAINT event_participants_fixture_workspace_fkey
    FOREIGN KEY (event_id, participant_workspace_id)
    REFERENCES event_fixture_workspaces(event_id, workspace_id) ON DELETE RESTRICT;

CREATE INDEX event_participants_event_workspace_idx
  ON event_participants (event_id, participant_workspace_id);
