ALTER TABLE clubs
  ADD COLUMN public_schedule_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_clubs_public_schedule_name
  ON clubs (lower(name))
  WHERE public_schedule_enabled = true;
