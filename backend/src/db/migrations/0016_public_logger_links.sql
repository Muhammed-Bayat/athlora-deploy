CREATE TABLE public_logger_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_public_logger_links_event_id ON public_logger_links(event_id);

CREATE TABLE public_logger_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public_logger_links(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  logger_name TEXT NOT NULL,
  logger_club TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_public_logger_session_event UNIQUE (id, event_id)
);

CREATE INDEX idx_public_logger_sessions_token_hash ON public_logger_sessions(token_hash);
CREATE INDEX idx_public_logger_sessions_event_id ON public_logger_sessions(event_id);

ALTER TABLE timeline_entries
  ALTER COLUMN recorded_by DROP NOT NULL,
  ADD COLUMN public_logger_session_id UUID;

ALTER TABLE timeline_entries
  ADD CONSTRAINT fk_timeline_entries_public_logger_session
    FOREIGN KEY (public_logger_session_id, event_id)
    REFERENCES public_logger_sessions(id, event_id),
  ADD CONSTRAINT ck_timeline_entries_exactly_one_actor
    CHECK (
      (recorded_by IS NOT NULL AND public_logger_session_id IS NULL)
      OR (recorded_by IS NULL AND public_logger_session_id IS NOT NULL)
    );

CREATE INDEX idx_timeline_entries_public_logger_session_id
  ON timeline_entries(public_logger_session_id)
  WHERE public_logger_session_id IS NOT NULL;
