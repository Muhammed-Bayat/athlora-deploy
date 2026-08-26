-- Workspace access has two operational roles. Relax checks before converting legacy viewers.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
UPDATE users SET role = 'assistant' WHERE role = 'viewer';
UPDATE workspace_members SET role = 'assistant' WHERE role = 'viewer';
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('coach', 'assistant'));
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('coach', 'assistant'));

CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach', 'assistant')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspace_invitations_workspace_id_idx ON workspace_invitations(workspace_id, created_at);
CREATE INDEX workspace_invitations_email_idx ON workspace_invitations(email);

CREATE TABLE workspace_membership_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  actor_id UUID REFERENCES users(id),
  invitation_id UUID REFERENCES workspace_invitations(id),
  action TEXT NOT NULL CHECK (action IN ('invited', 'resent', 'accepted', 'revoked', 'removed', 'role_changed')),
  role TEXT CHECK (role IN ('coach', 'assistant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspace_membership_audit_workspace_id_idx ON workspace_membership_audit(workspace_id, created_at);
