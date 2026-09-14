-- 0004: durable account-deletion state
-- The tombstone survives local user deletion so stale Auth0 access tokens cannot
-- recreate an account through PUT /auth/me.

CREATE TABLE account_deletions (
  auth0_id      TEXT PRIMARY KEY,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'failed', 'completed')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  last_error    TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_account_deletions_status ON account_deletions (status);
CREATE INDEX idx_account_deletions_retry ON account_deletions (next_attempt_at)
  WHERE status IN ('pending', 'failed');
