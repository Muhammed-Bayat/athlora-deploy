ALTER TABLE athlete_injuries
  ALTER COLUMN occurrence_date DROP NOT NULL;

ALTER TABLE athlete_injuries
  DROP CONSTRAINT athlete_injuries_dates_check,
  ADD CONSTRAINT athlete_injuries_dates_check
    CHECK (
      occurrence_date IS NULL OR
      (expected_return_date IS NULL OR expected_return_date >= occurrence_date) AND
      (resolved_date IS NULL OR resolved_date::date >= occurrence_date)
    );
