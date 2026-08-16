import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import { createAthlete, getAthlete, listAthletes, setAthleteArchived } from './athletes.js';

/**
 * Athlete persistence integration tests against a real PostgreSQL database.
 *
 * Gated on TEST_DATABASE_URL (NOT DATABASE_URL) so normal test runs and CI
 * stay green without a database. When set, it MUST point at a disposable
 * database: the suite drops and recreates the project tables in `public`.
 *
 * Local verification:
 *   docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
 *   $env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/postgres'
 *   npx vitest run src/services/athletes.integration.test.ts
 */

const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;

const TABLES = [
  'results',
  'timeline_entries',
  'event_participants',
  'events',
  'athletes',
  'users',
  'schema_migrations',
];

describeDB('athletes against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;

  beforeEach(async () => {
    pool = new pg.Pool({ connectionString });
    migrations = await loadMigrations();
    const client = await pool.connect();
    try {
      await applyMigrations(client, migrations);
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    const client = await pool.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS ${TABLES.join(', ')} CASCADE`);
    } finally {
      client.release();
    }
    await pool.end();
  });

  const seedCoach = async (auth0Id: string): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (auth0_id, name, email) VALUES ($1, $2, $3) RETURNING id`,
      [auth0Id, `Coach ${auth0Id}`, `${auth0Id}@example.com`],
    );
    return rows[0].id;
  };

  it('creates and lists athletes scoped to the coach with archival filtering', async () => {
    const coachId = await seedCoach('auth|athletes-1');
    const created = await createAthlete(
      coachId,
      { name: 'Ari Runner', dob: '2010-04-12', squad: 'Sprint', gender: null, notes: null },
      pool,
    );
    expect(created.id).toBeDefined();
    expect(created.coachId).toBe(coachId);

    await setAthleteArchived(coachId, created.id, true, pool);

    const active = await listAthletes(coachId, { includeArchived: false }, pool);
    expect(active).toHaveLength(0);

    const all = await listAthletes(coachId, { includeArchived: true }, pool);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(created.id);
    expect(all[0].archivedAt).not.toBeNull();
  });

  it('filters the roster by name substring and squad', async () => {
    const coachId = await seedCoach('auth|athletes-2');
    await createAthlete(
      coachId,
      { name: 'Ada Runner', dob: null, squad: 'Sprint', gender: null, notes: null },
      pool,
    );
    await createAthlete(
      coachId,
      { name: 'Zulu Thrower', dob: null, squad: 'Throws', gender: null, notes: null },
      pool,
    );

    const matches = await listAthletes(
      coachId,
      { includeArchived: false, name: 'ada', squad: 'Sprint' },
      pool,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Ada Runner');
  });

  it('preserves timeline entries and results when an athlete is archived', async () => {
    const coachId = await seedCoach('auth|athletes-3');
    const created = await createAthlete(
      coachId,
      { name: 'Sprint Star', dob: null, gender: null, squad: null, notes: null },
      pool,
    );
    const { rows: eventRows } = await pool.query<{ id: string }>(
      `INSERT INTO events (created_by, type, title, date)
       VALUES ($1, 'competition', '100m meet', '2026-08-10') RETURNING id`,
      [coachId],
    );
    const eventId = eventRows[0].id;
    await pool.query(
      `INSERT INTO timeline_entries (event_id, athlete_id, discipline, entry_type, value, unit, recorded_by)
       VALUES ($1, $2, '100m', 'attempt', 11.24, 'seconds', $3)`,
      [eventId, created.id, coachId],
    );
    await pool.query(
      `INSERT INTO results (event_id, athlete_id, discipline, outcome, final_result)
       VALUES ($1, $2, '100m', 'valid', 11.24)`,
      [eventId, created.id],
    );

    await setAthleteArchived(coachId, created.id, true, pool);

    const athlete = await getAthlete(coachId, created.id, pool);
    expect(athlete.archivedAt).not.toBeNull();

    const entries = await pool.query('SELECT 1 FROM timeline_entries WHERE athlete_id = $1', [
      created.id,
    ]);
    expect(entries.rowCount).toBe(1);
    const results = await pool.query('SELECT 1 FROM results WHERE athlete_id = $1', [created.id]);
    expect(results.rowCount).toBe(1);

    await setAthleteArchived(coachId, created.id, false, pool);
    const restored = await getAthlete(coachId, created.id, pool);
    expect(restored.archivedAt).toBeNull();
  });

  it('isolates roster records between coaches', async () => {
    const coachA = await seedCoach('auth|athletes-4a');
    const coachB = await seedCoach('auth|athletes-4b');
    const created = await createAthlete(
      coachA,
      { name: 'A Only', dob: null, gender: null, squad: null, notes: null },
      pool,
    );

    await expect(getAthlete(coachB, created.id, pool)).rejects.toMatchObject({ status: 404 });
    const roster = await listAthletes(coachB, { includeArchived: false }, pool);
    expect(roster).toHaveLength(0);
  });

  it('rejects a malformed athlete id without querying', async () => {
    const coachId = await seedCoach('auth|athletes-5');

    await expect(getAthlete(coachId, 'not-a-uuid', pool)).rejects.toMatchObject({ status: 404 });
  });
});
