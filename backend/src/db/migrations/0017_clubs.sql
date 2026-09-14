CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every existing workspace becomes a club while retaining its established identity and membership.
INSERT INTO clubs (workspace_id, name)
SELECT id, name
FROM workspaces;

CREATE INDEX idx_clubs_name ON clubs (lower(name));

CREATE TABLE club_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL)
    OR (status IN ('pending', 'withdrawn') AND reviewed_at IS NULL)
  )
);

CREATE UNIQUE INDEX uq_club_join_requests_pending
  ON club_join_requests (club_id, user_id)
  WHERE status = 'pending';
CREATE INDEX idx_club_join_requests_user_created_at
  ON club_join_requests (user_id, created_at DESC);
CREATE INDEX idx_club_join_requests_club_status_created_at
  ON club_join_requests (club_id, status, created_at);
