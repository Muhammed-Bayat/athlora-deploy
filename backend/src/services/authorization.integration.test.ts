import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { DbExecutor } from '../db/client.js';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import type { EventStatus, EventType } from '../types/domain.js';
import { listAthletes, getAthlete, replaceAthlete, setAthleteArchived } from './athletes.js';
import { listEvents, getEvent } from './events.js';
import {
  listEventParticipants,
  addEventParticipant,
  replaceEventParticipant,
  removeEventParticipant,
} from './participants.js';
import {
  listTimelineEntries,
  createTimelineEntry,
  updateTimelineEntry,
  removeTimelineEntry,
} from './timeline.js';
import {
  assertAthleteOwnership,
  assertEventOwnership,
  assertParticipantOwnership,
  assertResultOwnership,
  assertTimelineEntryOwnership,
} from './ownership.js';
import { getAthleteStatisticsDetail } from './statistics.js';

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
const notFound = expect.objectContaining({ status: 404, code: 'NOT_FOUND' });

describeDB('cross-coach ownership isolation against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;

  const withClient = async <T>(
    operation: (client: DbExecutor) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      return await operation(client);
    } finally {
      client.release();
    }
  };

  const runReadTransaction = async <T>(
    operation: (client: DbExecutor) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
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

  const runWriteTransaction = async <T>(
    operation: (client: DbExecutor) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
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
      [`auth0|ownership-${suffix}`, `Coach ${suffix}`, `ownership-${suffix}@example.com`],
    );
    return rows[0].id;
  }

  async function seedAthlete(coachId: string, name: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO athletes (coach_id, name, squad)
       VALUES ($1, $2, 'Sprint')
       RETURNING id`,
      [coachId, name],
    );
    return rows[0].id;
  }

  async function seedEvent(
    coachId: string,
    title: string,
    type: EventType,
    status: EventStatus,
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO events
         (created_by, type, discipline, title, date, status)
       VALUES ($1, $2, '100m', $3, '2026-08-18', $4)
       RETURNING id`,
      [coachId, type, title, status],
    );
    return rows[0].id;
  }

  it('scopes athlete reads and mutations to the owning coach', async () => {
    const coachId = await seedCoach('athletes');
    const otherCoachId = await seedCoach('athletes-other');
    const athleteId = await seedAthlete(coachId, 'Owned Runner');

    await expect(
      withClient((executor) => getAthlete(coachId, athleteId, executor)),
    ).resolves.toMatchObject({ id: athleteId });
    await expect(
      withClient((executor) => getAthlete(otherCoachId, athleteId, executor)),
    ).rejects.toMatchObject(notFound);
    await expect(
      withClient((executor) =>
        replaceAthlete(otherCoachId, athleteId, {
          name: 'Sneak Edit',
          dob: null,
          gender: null,
          squad: null,
          notes: null,
        }, executor),
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      withClient((executor) => setAthleteArchived(otherCoachId, athleteId, true, executor)),
    ).rejects.toMatchObject(notFound);
    await expect(
      withClient((executor) => assertAthleteOwnership(otherCoachId, athleteId, executor)),
    ).rejects.toMatchObject(notFound);

    await expect(
      withClient((executor) => listAthletes(otherCoachId, { includeArchived: false }, executor)),
    ).resolves.toEqual([]);
    await expect(
      withClient((executor) =>
        listAthletes(coachId, { includeArchived: false }, executor),
      ),
    ).resolves.toEqual([expect.objectContaining({ id: athleteId })]);
  });

  it('scopes events and participant mutations to the owning coach', async () => {
    const coachId = await seedCoach('events');
    const otherCoachId = await seedCoach('events-other');
    const athleteId = await seedAthlete(coachId, 'Event Runner');
    const eventId = await seedEvent(coachId, 'Owned Meet', 'competition', 'scheduled');

    await expect(withClient((executor) => getEvent(coachId, eventId, executor)))
      .resolves.toMatchObject({ id: eventId });
    await expect(withClient((executor) => getEvent(otherCoachId, eventId, executor)))
      .rejects.toMatchObject(notFound);
    await expect(
      withClient((executor) => assertEventOwnership(otherCoachId, eventId, executor)),
    ).rejects.toMatchObject(notFound);

    await expect(withClient((executor) => listEvents(otherCoachId, {}, executor)))
      .resolves.toEqual([]);
    await expect(withClient((executor) => listEvents(coachId, {}, executor)))
      .resolves.toEqual([expect.objectContaining({ id: eventId })]);

    await expect(
      withClient((executor) => listEventParticipants(otherCoachId, eventId, executor)),
    ).resolves.toEqual([]);
    await expect(
      addEventParticipant(otherCoachId, eventId, { athleteId }, runWriteTransaction),
    ).rejects.toMatchObject(notFound);

    await expect(
      addEventParticipant(coachId, eventId, { athleteId }, runWriteTransaction),
    ).resolves.toMatchObject({ eventId, athleteId });

    await expect(
      withClient((executor) =>
        replaceEventParticipant(otherCoachId, eventId, athleteId, { rsvpStatus: 'yes' }, executor),
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      withClient((executor) =>
        replaceEventParticipant(coachId, eventId, athleteId, { rsvpStatus: 'yes' }, executor),
      ),
    ).resolves.toMatchObject({ eventId, athleteId, rsvpStatus: 'yes' });
    await expect(
      withClient((executor) => removeEventParticipant(otherCoachId, eventId, athleteId, executor)),
    ).rejects.toMatchObject(notFound);
    await expect(
      withClient((executor) => assertParticipantOwnership(otherCoachId, eventId, athleteId, executor)),
    ).rejects.toMatchObject(notFound);
  });

  it('scopes timeline entries and result overrides to the owning coach', async () => {
    const coachId = await seedCoach('timeline');
    const otherCoachId = await seedCoach('timeline-other');
    const athleteId = await seedAthlete(coachId, 'Live Runner');
    const eventId = await seedEvent(coachId, 'Owned Live Meet', 'competition', 'in_progress');
    const payload = {
      athleteId,
      discipline: '100m' as const,
      entryType: 'attempt' as const,
      value: 10.5,
      unit: 'seconds' as const,
      isFoul: false as const,
      incidentType: null,
      noteText: null,
      deviceId: null,
    };

    await expect(
      withClient((executor) => listTimelineEntries(otherCoachId, eventId, executor)),
    ).resolves.toEqual([]);

    const entry = await createTimelineEntry(coachId, eventId, payload, runWriteTransaction);
    expect(entry).toMatchObject({ eventId, athleteId, value: 10.5, version: 1 });

    await expect(
      createTimelineEntry(otherCoachId, eventId, { ...payload, value: 9.9 }, runWriteTransaction),
    ).rejects.toMatchObject(notFound);
    await expect(
      updateTimelineEntry(
        otherCoachId,
        eventId,
        entry.id,
        { expectedVersion: 1, value: 9.9 },
        runWriteTransaction,
      ),
    ).rejects.toMatchObject(notFound);
    await expect(
      removeTimelineEntry(otherCoachId, eventId, entry.id, { expectedVersion: 1 }, runWriteTransaction),
    ).rejects.toMatchObject(notFound);
    await expect(
      withClient((executor) => assertTimelineEntryOwnership(otherCoachId, eventId, entry.id, executor)),
    ).rejects.toMatchObject(notFound);

    // The owning coach can still update and undo their own entries.
    await expect(
      updateTimelineEntry(coachId, eventId, entry.id, { expectedVersion: 1, value: 10.4 }, runWriteTransaction),
    ).resolves.toMatchObject({ id: entry.id, value: 10.4, version: 2 });
    await expect(
      removeTimelineEntry(coachId, eventId, entry.id, { expectedVersion: 2 }, runWriteTransaction),
    ).resolves.toBeUndefined();

    // The result-override guard (PUT /:eventId/results/:athleteId) is ownership-scoped.
    await expect(
      withClient((executor) => assertResultOwnership(otherCoachId, eventId, athleteId, executor)),
    ).rejects.toMatchObject(notFound);

    await expect(
      getAthleteStatisticsDetail(otherCoachId, athleteId, '2026-08-18', runReadTransaction),
    ).rejects.toMatchObject(notFound);
  });
});