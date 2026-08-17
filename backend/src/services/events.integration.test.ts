import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { DbExecutor } from '../db/client.js';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import {
  assertEventLoggingOpen,
  cancelEvent,
  createEvent,
  getEvent,
  listEvents,
  replaceEvent,
} from './events.js';

/**
 * Event persistence integration tests against a real PostgreSQL database.
 *
 * Gated on TEST_DATABASE_URL (NOT DATABASE_URL) so normal test runs and CI
 * stay green without a database. When set, it MUST point at a disposable
 * database: the suite drops and recreates the project tables in `public`.
 *
 * Local verification:
 *   docker run --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16
 *   $env:TEST_DATABASE_URL='postgres://postgres:postgres@localhost:55432/postgres'
 *   npx vitest run src/services/events.integration.test.ts
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

describeDB('events against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;

  const runTransaction = async <T>(operation: (client: DbExecutor) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

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

  const seedEvent = async (
    coachId: string,
    title: string,
    date: string,
    status = 'scheduled',
  ): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO events (created_by, type, title, date, status) VALUES ($1, 'competition', $2, $3, $4) RETURNING id`,
      [coachId, title, date, status],
    );
    return rows[0].id;
  };

  it('creates and lists events scoped to the coach with filters and stable ordering', async () => {
    const coachId = await seedCoach('auth|events-1');
    const created = await createEvent(
      coachId,
      {
        type: 'competition',
        discipline: '100m',
        title: 'City Sprint Meet',
        date: '2026-09-01',
        time: '10:00:00',
        locationName: 'Main track',
        latitude: 51.5,
        longitude: -0.12,
        status: 'scheduled',
      },
      pool,
    );
    expect(created.id).toBeDefined();
    expect(created.createdBy).toBe(coachId);
    expect(created.discipline).toBe('100m');

    const matches = await listEvents(
      coachId,
      { type: 'competition', dateFrom: '2026-09-01', dateTo: '2026-09-30' },
      pool,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe(created.id);
    expect(matches[0].title).toBe('City Sprint Meet');
    expect(matches[0].latitude).toBeCloseTo(51.5);
  });

  it('moves an event through the full lifecycle deterministically', async () => {
    const coachId = await seedCoach('auth|events-2');
    const created = await createEvent(
      coachId,
      {
        type: 'competition',
        discipline: '100m',
        title: 'Sprint Meet',
        date: '2026-09-01',
        time: null,
        locationName: null,
        latitude: null,
        longitude: null,
        status: 'scheduled',
      },
      pool,
    );

    const started = await replaceEvent(
      coachId,
      created.id,
      {
        type: 'competition',
        discipline: '100m',
        title: 'Sprint Meet',
        date: '2026-09-01',
        time: null,
        locationName: null,
        latitude: null,
        longitude: null,
        status: 'in_progress',
      },
      runTransaction,
    );
    expect(started.status).toBe('in_progress');
    await expect(assertEventLoggingOpen(coachId, created.id, pool)).resolves.toBeUndefined();

    const completed = await replaceEvent(
      coachId,
      created.id,
      {
        type: 'competition',
        discipline: '100m',
        title: 'Sprint Meet',
        date: '2026-09-01',
        time: null,
        locationName: null,
        latitude: null,
        longitude: null,
        status: 'completed',
      },
      runTransaction,
    );
    expect(completed.status).toBe('completed');

    await expect(
      replaceEvent(
        coachId,
        created.id,
        {
          type: 'competition',
          discipline: '100m',
          title: 'Sprint Meet',
          date: '2026-09-01',
          time: null,
          locationName: null,
          latitude: null,
          longitude: null,
          status: 'in_progress',
        },
        runTransaction,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_EVENT_TRANSITION',
      details: { from: 'completed', to: 'in_progress' },
    });

    const reloaded = await getEvent(coachId, created.id, pool);
    expect(reloaded.status).toBe('completed');
  });

  it('cancels an event without destroying its timeline or results history', async () => {
    const coachId = await seedCoach('auth|events-3');
    const eventId = await seedEvent(coachId, 'Meet', '2026-09-01', 'in_progress');
    const { rows: athleteRows } = await pool.query<{ id: string }>(
      `INSERT INTO athletes (coach_id, name) VALUES ($1, 'Ari Runner') RETURNING id`,
      [coachId],
    );
    const athleteId = athleteRows[0].id;
    await pool.query(
      `INSERT INTO timeline_entries (event_id, athlete_id, discipline, entry_type, value, unit, recorded_by)
       VALUES ($1, $2, '100m', 'attempt', 11.24, 'seconds', $3)`,
      [eventId, athleteId, coachId],
    );
    await pool.query(
      `INSERT INTO results (event_id, athlete_id, discipline, outcome, final_result)
       VALUES ($1, $2, '100m', 'valid', 11.24)`,
      [eventId, athleteId],
    );

    const cancelled = await cancelEvent(coachId, eventId, runTransaction);
    expect(cancelled.status).toBe('cancelled');

    const entries = await pool.query('SELECT 1 FROM timeline_entries WHERE event_id = $1', [
      eventId,
    ]);
    expect(entries.rowCount).toBe(1);
    const results = await pool.query('SELECT 1 FROM results WHERE event_id = $1', [eventId]);
    expect(results.rowCount).toBe(1);

    await expect(assertEventLoggingOpen(coachId, eventId, pool)).rejects.toMatchObject({
      status: 409,
      code: 'EVENT_NOT_IN_PROGRESS',
    });
  });

  it('prevents a cancelled event from starting again', async () => {
    const coachId = await seedCoach('auth|events-4');
    const eventId = await seedEvent(coachId, 'Meet', '2026-09-01', 'cancelled');

    await expect(
      replaceEvent(
        coachId,
        eventId,
        {
          type: 'competition',
          discipline: '100m',
          title: 'Meet',
          date: '2026-09-01',
          time: null,
          locationName: null,
          latitude: null,
          longitude: null,
          status: 'in_progress',
        },
        runTransaction,
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_EVENT_TRANSITION',
      details: { from: 'cancelled', to: 'in_progress' },
    });
  });

  it('isolates events between coaches', async () => {
    const coachA = await seedCoach('auth|events-5a');
    const coachB = await seedCoach('auth|events-5b');
    const created = await createEvent(
      coachA,
      {
        type: 'training',
        discipline: '100m',
        title: 'A Only',
        date: '2026-09-01',
        time: null,
        locationName: null,
        latitude: null,
        longitude: null,
        status: 'scheduled',
      },
      pool,
    );

    await expect(getEvent(coachB, created.id, pool)).rejects.toMatchObject({ status: 404 });
    const events = await listEvents(coachB, {}, pool);
    expect(events).toHaveLength(0);
  });

  it('rejects a malformed event id without querying', async () => {
    const coachId = await seedCoach('auth|events-6');

    await expect(getEvent(coachId, 'not-a-uuid', pool)).rejects.toMatchObject({ status: 404 });
  });
});
