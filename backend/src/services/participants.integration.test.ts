import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { DbExecutor } from '../db/client.js';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import {
  addEventParticipant,
  listEventParticipants,
  removeEventParticipant,
  replaceEventParticipant,
} from './participants.js';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;

const TABLES = [
  'account_deletions',
  'results',
  'timeline_entries',
  'event_participants',
  'events',
  'athletes',
  'users',
  'schema_migrations',
];

describeDB('event participants against a real database', () => {
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

  async function seedCoach(suffix: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (auth0_id, name, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`auth0|participants-${suffix}`, `Coach ${suffix}`, `participants-${suffix}@example.com`],
    );
    return rows[0].id;
  }

  async function seedEvent(coachId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO events (created_by, type, discipline, title, date)
       VALUES ($1, 'competition', '100m', 'Sprint Meet', '2026-09-01')
       RETURNING id`,
      [coachId],
    );
    return rows[0].id;
  }

  async function seedAthlete(coachId: string, name: string, archived = false): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO athletes (coach_id, name, squad, archived_at)
       VALUES ($1, $2, 'Sprint', $3)
       RETURNING id`,
      [coachId, name, archived ? new Date() : null],
    );
    return rows[0].id;
  }

  it('persists, lists, and idempotently updates an assignment', async () => {
    const coachId = await seedCoach('crud');
    const eventId = await seedEvent(coachId);
    const athleteId = await seedAthlete(coachId, 'Ari Runner');

    const assigned = await addEventParticipant(coachId, eventId, { athleteId }, runTransaction);
    expect(assigned).toMatchObject({
      eventId,
      athleteId,
      rsvpStatus: 'pending',
      athlete: { id: athleteId, name: 'Ari Runner', squad: 'Sprint', archivedAt: null },
    });
    await expect(listEventParticipants(coachId, eventId, pool)).resolves.toEqual([assigned]);

    const updated = await replaceEventParticipant(
      coachId,
      eventId,
      athleteId,
      { rsvpStatus: 'yes' },
      pool,
    );
    expect(updated.rsvpStatus).toBe('yes');
    await expect(
      replaceEventParticipant(coachId, eventId, athleteId, { rsvpStatus: 'yes' }, pool),
    ).resolves.toMatchObject({ rsvpStatus: 'yes' });
  });

  it('prevents duplicate assignments and rejects newly assigning archived athletes', async () => {
    const coachId = await seedCoach('conflicts');
    const eventId = await seedEvent(coachId);
    const activeId = await seedAthlete(coachId, 'Active Runner');
    const archivedId = await seedAthlete(coachId, 'Archived Runner', true);

    await addEventParticipant(coachId, eventId, { athleteId: activeId }, runTransaction);
    await expect(
      addEventParticipant(coachId, eventId, { athleteId: activeId }, runTransaction),
    ).rejects.toMatchObject({ status: 409, code: 'PARTICIPANT_ALREADY_ASSIGNED' });
    await expect(
      addEventParticipant(coachId, eventId, { athleteId: archivedId }, runTransaction),
    ).rejects.toMatchObject({ status: 409, code: 'ATHLETE_ARCHIVED' });
  });

  it('preserves an existing assignment when its athlete is later archived', async () => {
    const coachId = await seedCoach('archive');
    const eventId = await seedEvent(coachId);
    const athleteId = await seedAthlete(coachId, 'Ari Runner');
    await addEventParticipant(coachId, eventId, { athleteId }, runTransaction);

    await pool.query(`UPDATE athletes SET archived_at = now() WHERE id = $1`, [athleteId]);

    const participants = await listEventParticipants(coachId, eventId, pool);
    expect(participants).toHaveLength(1);
    expect(participants[0].athlete.archivedAt).not.toBeNull();
    await expect(
      addEventParticipant(coachId, eventId, { athleteId }, runTransaction),
    ).rejects.toMatchObject({ status: 409, code: 'PARTICIPANT_ALREADY_ASSIGNED' });
  });

  it('preserves timeline and result history when an assignment is removed', async () => {
    const coachId = await seedCoach('history');
    const eventId = await seedEvent(coachId);
    const athleteId = await seedAthlete(coachId, 'Ari Runner');
    await addEventParticipant(coachId, eventId, { athleteId }, runTransaction);
    await pool.query(
      `INSERT INTO timeline_entries
         (event_id, athlete_id, discipline, entry_type, value, unit, recorded_by)
       VALUES ($1, $2, '100m', 'attempt', 11.2, 'seconds', $3)`,
      [eventId, athleteId, coachId],
    );
    await pool.query(
      `INSERT INTO results
         (event_id, athlete_id, discipline, outcome, final_result, unit)
       VALUES ($1, $2, '100m', 'valid', 11.2, 'seconds')`,
      [eventId, athleteId],
    );

    await removeEventParticipant(coachId, eventId, athleteId, pool);

    const assignment = await pool.query(
      `SELECT 1 FROM event_participants WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    const entries = await pool.query(
      `SELECT 1 FROM timeline_entries WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    const results = await pool.query(
      `SELECT 1 FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    expect(assignment.rowCount).toBe(0);
    expect(entries.rowCount).toBe(1);
    expect(results.rowCount).toBe(1);
  });

  it('does not expose another coach’s event or athlete through assignment operations', async () => {
    const coachId = await seedCoach('owner');
    const otherCoachId = await seedCoach('other');
    const eventId = await seedEvent(coachId);
    const otherAthleteId = await seedAthlete(otherCoachId, 'Other Runner');

    await expect(
      addEventParticipant(coachId, eventId, { athleteId: otherAthleteId }, runTransaction),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
