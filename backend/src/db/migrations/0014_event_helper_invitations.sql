CREATE TABLE IF NOT EXISTS event_helper_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  human_code TEXT NOT NULL UNIQUE,
  max_cap INT NOT NULL DEFAULT 10 CHECK (max_cap >= 1 AND max_cap <= 50),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'revoked')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_helper_invitations_event_id ON event_helper_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_helper_invitations_human_code ON event_helper_invitations(human_code);

CREATE TABLE IF NOT EXISTS event_helper_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL REFERENCES event_helper_invitations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  auth0_sub TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_helper_grant UNIQUE (event_id, auth0_sub)
);

CREATE INDEX IF NOT EXISTS idx_event_helper_grants_event_id ON event_helper_grants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_helper_grants_auth0_sub ON event_helper_grants(auth0_sub);

CREATE TABLE IF NOT EXISTS event_helper_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invitation_id UUID REFERENCES event_helper_invitations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_sub TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_helper_audit_logs_event_id ON event_helper_audit_logs(event_id);
