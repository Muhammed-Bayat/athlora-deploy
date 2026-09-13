ALTER TABLE clubs
  ADD COLUMN public_results_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_clubs_public_results_name
  ON clubs (lower(name))
  WHERE public_results_enabled = true;
