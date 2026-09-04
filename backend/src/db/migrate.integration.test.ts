import { describe, expect, it, afterEach, beforeAll } from 'vitest';
import pg from 'pg';
import { applyMigrations, loadMigrations } from './migrate.js';
import { listGuestFixtures } from '../services/fixtures.js';

/**
 * Migration integration tests against a real PostgreSQL database.
 *
 * Gated on TEST_DATABASE_URL (NOT DATABASE_URL) so normal test runs and CI
 * stay green without a database. When set, it MUST point at a disposable
 * database: the suite drops and recreates the project tables in `public`.
 *
 * Local verification:
 *   docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
 *   $env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/postgres'
 *   npx vitest run src/db/migrate.integration.test.ts
 */

const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;

const TABLES = [
  'fixture_notifications',
  'fixture_invitation_responses',
  'fixture_invitations',
  'event_fixture_workspaces',
  'athlete_squads',
  'squads',
  'workspace_membership_audit',
  'workspace_invitations',
  'workspace_members',
  'workspaces',
  'account_deletions',
  'results',
  'timeline_entries',
  'event_participants',
  'events',
  'athletes',
  'users',
  'schema_migrations',
];

describeDB('migrations against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString });
    migrations = await loadMigrations();
  });

  afterEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS ${TABLES.join(', ')} CASCADE`);
      await client.query('DROP FUNCTION IF EXISTS create_event_fixture_host() CASCADE');
    } finally {
      client.release();
    }
  });

  const migrate = async () => {
    const client = await pool.connect();
    try {
      await applyMigrations(client, migrations);
    } finally {
      client.release();
    }
  };

  const hasColumn = async (table: string, column: string) => {
    const result = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return result.rowCount === 1;
  };

  const hasIndex = async (name: string) => {
    const result = await pool.query('SELECT 1 FROM pg_indexes WHERE indexname = $1', [name]);
    return result.rowCount === 1;
  };

  it('applies all migrations to a fresh database and records checksums', async () => {
    await migrate();

    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((row) => row.name)).toEqual([
      '0001_init.sql',
      '0002_contract_100m.sql',
      '0003_aggregate_indexes.sql',
      '0004_account_lifecycle.sql',
      '0005_workspace_tenancy.sql',
      '0006_workspace_roles_and_invitations.sql',
      '0007_workspace_squads.sql',
      '0008_athlete_lifecycle.sql',
      '0009_intermediate_fixtures.sql',
      '0010_fixture_workspace_status_index.sql',
    ]);

    expect(await hasColumn('athletes', 'archived_at')).toBe(true);
    expect(await hasColumn('timeline_entries', 'note_text')).toBe(true);
    expect(await hasColumn('results', 'outcome')).toBe(true);
    expect(await hasColumn('results', 'override_at')).toBe(true);
    expect(await hasColumn('account_deletions', 'completed_at')).toBe(true);
    expect(await hasColumn('account_deletions', 'next_attempt_at')).toBe(true);
    expect(await hasColumn('athletes', 'workspace_id')).toBe(true);
    expect(await hasColumn('athletes', 'lifecycle_status')).toBe(true);
    expect(await hasColumn('athletes', 'status_changed_by')).toBe(true);
    expect(await hasColumn('athlete_squads', 'squad_id')).toBe(true);
    expect(await hasColumn('events', 'fixture_revision')).toBe(true);
    expect(await hasColumn('event_participants', 'participant_workspace_id')).toBe(true);

    expect(await hasIndex('idx_events_created_by')).toBe(true);
    expect(await hasIndex('idx_events_status_date')).toBe(true);
    expect(await hasIndex('idx_event_participants_athlete_id')).toBe(true);
    expect(await hasIndex('idx_timeline_entries_event_athlete_discipline')).toBe(true);
    expect(await hasIndex('idx_results_athlete_discipline_event')).toBe(true);
    expect(await hasIndex('idx_events_owner_status_date_order')).toBe(true);
    expect(await hasIndex('idx_timeline_entries_event_active_recent')).toBe(true);
    expect(await hasIndex('idx_account_deletions_status')).toBe(true);
    expect(await hasIndex('idx_account_deletions_retry')).toBe(true);
  });

  it('baselines an existing 0001 schema and applies the pending 0002', async () => {
    const client = await pool.connect();
    try {
      const initial = migrations.find((migration) => migration.name === '0001_init.sql');
      expect(initial).toBeDefined();
      await client.query(initial!.sql);
    } finally {
      client.release();
    }

    await migrate();

    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((row) => row.name)).toEqual([
      '0001_init.sql',
      '0002_contract_100m.sql',
      '0003_aggregate_indexes.sql',
      '0004_account_lifecycle.sql',
      '0005_workspace_tenancy.sql',
      '0006_workspace_roles_and_invitations.sql',
      '0007_workspace_squads.sql',
      '0008_athlete_lifecycle.sql',
      '0009_intermediate_fixtures.sql',
      '0010_fixture_workspace_status_index.sql',
    ]);
    expect(await hasColumn('results', 'outcome')).toBe(true);
  });

  it('is idempotent on an already-migrated database', async () => {
    await migrate();
    await migrate();

    const { rows } = await pool.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
    expect(rows).toHaveLength(10);
    expect(await hasColumn('results', 'outcome')).toBe(true);
  });

  it('rejects an applied migration whose checksum changed', async () => {
    await migrate();

    const tampered = migrations.map((migration) =>
      migration.name === '0002_contract_100m.sql'
        ? { ...migration, checksum: 'tampered' }
        : migration,
    );

    const client = await pool.connect();
    try {
      await expect(applyMigrations(client, tampered)).rejects.toThrow(
        'Applied migration 0002_contract_100m.sql has been modified',
      );
    } finally {
      client.release();
    }
  });

  it('enforces event status and type constraints', async () => {
    await migrate();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO users (auth0_id, name, email) VALUES ('auth|u1', 'Coach', 'c@example.com') RETURNING id`,
      );
      const coachId = rows[0].id;

      await expect(
        client.query(
          `INSERT INTO events (created_by, type, title, date, status)
           VALUES ($1, 'competition', 'Invalid', '2026-08-01', 'in_limbo')`,
          [coachId],
        ),
      ).rejects.toThrow('events_status_check');

      await expect(
        client.query(
          `INSERT INTO events (created_by, type, title, date)
           VALUES ($1, 'match', 'Invalid type', '2026-08-01')`,
          [coachId],
        ),
      ).rejects.toThrow('events_type_check');

      await client.query(
        `INSERT INTO events (created_by, type, title, date, status)
         VALUES ($1, 'competition', 'Valid', '2026-08-01', 'scheduled')`,
        [coachId],
      );
    } finally {
      client.release();
    }
  });

  it('enforces results outcome and value constraints', async () => {
    await migrate();
    const client = await pool.connect();
    try {
      const { rows: userRows } = await client.query(
        `INSERT INTO users (auth0_id, name, email) VALUES ('auth|u2', 'Coach', 'c2@example.com') RETURNING id`,
      );
      const coachId = userRows[0].id;
      const { rows: athleteRows } = await client.query(
        `INSERT INTO athletes (coach_id, name) VALUES ($1, 'Athlete'), ($1, 'Athlete Two') RETURNING id`,
        [coachId],
      );
      const [athleteId, athleteTwoId] = athleteRows.map((row) => row.id);
      const { rows: eventRows } = await client.query(
        `INSERT INTO events (created_by, type, title, date)
         VALUES ($1, 'competition', '100m', '2026-08-01') RETURNING id`,
        [coachId],
      );
      const eventId = eventRows[0].id;

      await expect(
        client.query(
          `INSERT INTO results (event_id, athlete_id, discipline, outcome)
           VALUES ($1, $2, '100m', 'undefined')`,
          [eventId, athleteId],
        ),
      ).rejects.toThrow('results_outcome_check');

      await expect(
        client.query(
          `INSERT INTO results (event_id, athlete_id, discipline, outcome, final_result)
           VALUES ($1, $2, '100m', 'dq', 11.5)`,
          [eventId, athleteId],
        ),
      ).rejects.toThrow('results_voided_has_no_value_check');

      await expect(
        client.query(
          `INSERT INTO results (event_id, athlete_id, discipline, outcome)
           VALUES ($1, $2, '100m', 'valid')`,
          [eventId, athleteId],
        ),
      ).rejects.toThrow('results_valid_has_value_check');

      const { rows } = await client.query(
        `INSERT INTO results (event_id, athlete_id, discipline, outcome, final_result)
         VALUES ($1, $2, '100m', 'valid', 11.24) RETURNING outcome`,
        [eventId, athleteId],
      );
      expect(rows[0].outcome).toBe('valid');

      const { rows: defaults } = await client.query(
        `INSERT INTO results (event_id, athlete_id, discipline)
         VALUES ($1, $2, '100m') RETURNING outcome, final_result`,
        [eventId, athleteTwoId],
      );
      expect(defaults[0].outcome).toBe('no_result');
      expect(defaults[0].final_result).toBeNull();
    } finally {
      client.release();
    }
  });

  it('allows host and guest workspaces to share an accepted fixture status', async () => {
    await migrate();
    const client = await pool.connect();
    try {
      const { rows: userRows } = await client.query(
        `INSERT INTO users (auth0_id, name, email)
         VALUES ('auth|host', 'Host Coach', 'host@example.com'),
                ('auth|guest', 'Guest Coach', 'guest@example.com')
         RETURNING id`,
      );
      const [hostUserId, guestUserId] = userRows.map((row) => row.id);
      const { rows: workspaceRows } = await client.query(
        `INSERT INTO workspaces (name) VALUES ('Host team'), ('Guest team') RETURNING id`,
      );
      const [hostWorkspaceId, guestWorkspaceId] = workspaceRows.map((row) => row.id);
      const { rows: eventRows } = await client.query(
        `INSERT INTO events (created_by, workspace_id, type, discipline, title, date)
         VALUES ($1, $2, 'competition', '100m', 'Fixture', '2026-09-01')
         RETURNING id`,
        [hostUserId, hostWorkspaceId],
      );

      await client.query(
        `INSERT INTO event_fixture_workspaces
           (event_id, workspace_id, role, status, contact_email, joined_by)
         VALUES ($1, $2, 'guest', 'accepted', 'guest@example.com', $3)`,
        [eventRows[0].id, guestWorkspaceId, guestUserId],
      );

      const { rows } = await client.query(
        `SELECT role, status FROM event_fixture_workspaces
         WHERE event_id = $1 ORDER BY role`,
        [eventRows[0].id],
      );
      expect(rows).toEqual([
        { role: 'guest', status: 'accepted' },
        { role: 'host', status: 'accepted' },
      ]);
      await expect(listGuestFixtures(guestWorkspaceId, client)).resolves.toMatchObject([
        {
          event: { id: eventRows[0].id, title: 'Fixture', status: 'scheduled' },
          teamStatus: 'accepted',
          teams: [
            { workspaceId: hostWorkspaceId, status: 'accepted' },
            { workspaceId: guestWorkspaceId, status: 'accepted' },
          ],
        },
      ]);
    } finally {
      client.release();
    }
  });
});
