-- The host workspace implicitly accepts every revision of its own fixture, but
-- advanceFixtureRevision never synced the host row's accepted_revision. Stats relations
-- comparing fw.accepted_revision = e.fixture_revision therefore excluded host-club
-- athletes from any event whose revision had advanced. Repair existing host rows.
UPDATE event_fixture_workspaces fw
SET accepted_revision = e.fixture_revision
FROM events e
WHERE e.id = fw.event_id
  AND fw.role = 'host'
  AND fw.accepted_revision <> e.fixture_revision;
