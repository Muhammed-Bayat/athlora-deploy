ALTER TABLE meet_entrants
  ADD COLUMN club_name TEXT,
  ADD COLUMN details TEXT,
  ADD CONSTRAINT meet_entrants_club_name_length_check
    CHECK (club_name IS NULL OR length(trim(club_name)) BETWEEN 1 AND 120),
  ADD CONSTRAINT meet_entrants_details_length_check
    CHECK (details IS NULL OR length(trim(details)) BETWEEN 1 AND 2000),
  ADD CONSTRAINT meet_entrants_guest_details_check
    CHECK (kind = 'guest' OR (club_name IS NULL AND details IS NULL));
