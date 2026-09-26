INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id)
SELECT DISTINCT legacy_athletes.athlete_id, definition.id
FROM (
  SELECT athlete_id FROM results WHERE discipline = '100m'
  UNION
  SELECT athlete_id FROM timeline_entries WHERE discipline = '100m'
  UNION
  SELECT participants.athlete_id
  FROM event_participants participants
  JOIN events ON events.id = participants.event_id
  WHERE events.discipline = '100m'
) AS legacy_athletes
CROSS JOIN LATERAL (
  SELECT id FROM discipline_definitions WHERE code = '100m' ORDER BY version DESC LIMIT 1
) AS definition
ON CONFLICT (athlete_id, discipline_definition_id) DO NOTHING;
