-- users: mirrors Auth0 identity, adds app-level role
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_id      TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'coach',   -- 'coach' | 'assistant' | 'viewer'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- athletes: belongs to a coach (owner), squads optional string tag for now
CREATE TABLE athletes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  dob           DATE,
  gender        TEXT,                             -- category, not restricted to binary
  squad         TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- events: competitions and training sessions
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    UUID NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL,                     -- 'competition' | 'training'
  discipline    TEXT,                               -- primary discipline tag, e.g. '100m', 'long_jump'; nullable for multi-discipline meets
  title         TEXT NOT NULL,
  date          DATE NOT NULL,
  time          TIME,
  location_name TEXT,
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  status        TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- event_participants: RSVP + fixture participation (Stage 2)
CREATE TABLE event_participants (
  event_id      UUID NOT NULL REFERENCES events(id),
  athlete_id    UUID NOT NULL REFERENCES athletes(id),
  rsvp_status   TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'yes' | 'no'
  PRIMARY KEY (event_id, athlete_id)
);

-- timeline_entries: append-only live log — the core of the app
CREATE TABLE timeline_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- client-generated in Stage 2+ for offline support
  event_id      UUID NOT NULL REFERENCES events(id),
  athlete_id    UUID NOT NULL REFERENCES athletes(id),
  discipline    TEXT NOT NULL,
  entry_type    TEXT NOT NULL,                      -- 'attempt' | 'split' | 'penalty' | 'note'
  value         NUMERIC,                             -- seconds for time, metres for distance/height
  unit          TEXT,                                -- 'seconds' | 'metres' | 'cm'
  is_foul       BOOLEAN NOT NULL DEFAULT false,
  incident_type TEXT,                                 -- 'false_start' | 'dq' | 'dnf' | 'dns' | 'lane_infringement' | null
  recorded_by   UUID NOT NULL REFERENCES users(id),
  version       INT NOT NULL DEFAULT 1,               -- Stage 3: bumped on every edit, used for merge conflict detection
  device_id     TEXT,                                 -- Stage 3: originating device for offline merge
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                            -- soft delete = "undo"
);

-- results: derived, materialized per athlete per event/discipline
CREATE TABLE results (
  event_id        UUID NOT NULL REFERENCES events(id),
  athlete_id      UUID NOT NULL REFERENCES athletes(id),
  discipline      TEXT NOT NULL,
  final_result    NUMERIC,
  unit            TEXT,
  placing         INT,
  is_pb           BOOLEAN NOT NULL DEFAULT false,
  is_sb           BOOLEAN NOT NULL DEFAULT false,
  manual_override NUMERIC,
  override_reason TEXT,
  overridden_by   UUID REFERENCES users(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, athlete_id, discipline)
);