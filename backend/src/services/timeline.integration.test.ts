import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { DbExecutor } from '../db/client.js';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import { mapResultRow, type ResultRow } from '../db/row-mappers.js';
import type { EventType } from '../types/domain.js';
import type { TimelineEntryCreatePayload } from '../validation/payloads.js';
import { cancelEvent, replaceEvent } from './events.js';
import {
  createTimelineEntry,
  listTimelineEntries,
  removeTimelineEntry,
  updateTimelineEntry,
} from './timeline.js';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;
const TABLES = [
  'athlete_squads', 'squads', 'workspace_membership_audit', 'workspace_invitations', 'workspace_members', 'workspaces',
  'account_deletions',
  'results',
  'timeline_entries',
  'event_participants',
  'events',
  'athletes',
  'users',
  'schema_migrations',
];

describeDB('timeline entries against a real database', () => {
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
      [`auth0|timeline-${suffix}`, `Coach ${suffix}`, `timeline-${suffix}@example.com`],
    );
    return rows[0].id;
  }

  async function seedEvent(
    coachId: string,
    suffix: string,
    type: EventType = 'competition',
    status = 'in_progress',
    date = '2026-09-01',
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO events (created_by, type, discipline, title, date, status)
       VALUES ($1, $2, '100m', $3, $4, $5)
       RETURNING id`,
      [coachId, type, `Sprint ${suffix}`, date, status],
    );
    return rows[0].id;
  }

  async function seedAthlete(coachId: string, name: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO athletes (workspace_id, coach_id, name)
       VALUES ($1, $1, $2)
       RETURNING id`,
      [coachId, name],
    );
    return rows[0].id;
  }

  function attempt(athleteId: string, value: number): TimelineEntryCreatePayload {
    return {
      athleteId,
      discipline: '100m',
      entryType: 'attempt',
      value,
      unit: 'seconds',
      isFoul: false,
      incidentType: null,
      noteText: null,
      deviceId: null,
    };
  }

  it('persists competition attempts and materializes the latest finish', async () => {
    const coachId = await seedCoach('competition');
    const eventId = await seedEvent(coachId, 'Competition');
    const athleteId = await seedAthlete(coachId, 'Ari Runner');

    const first = await createTimelineEntry(coachId, eventId, attempt(athleteId, 11.2), runTransaction);
    const second = await createTimelineEntry(coachId, eventId, attempt(athleteId, 11.05), runTransaction);
    expect(first.version).toBe(1);
    expect(second.recordedBy).toBe(coachId);

    const { rows } = await pool.query(
      `SELECT outcome, final_result, unit, "placing" AS placing, is_pb, is_sb
       FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    expect(rows[0]).toMatchObject({
      outcome: 'valid',
      final_result: '11.05',
      unit: 'seconds',
      placing: 1,
      is_pb: true,
      is_sb: true,
    });
  });

  it('uses the fastest training attempt and recomputes after a versioned patch', async () => {
    const coachId = await seedCoach('training');
    const eventId = await seedEvent(coachId, 'Training', 'training');
    const athleteId = await seedAthlete(coachId, 'Bea Sprinter');
    const first = await createTimelineEntry(coachId, eventId, attempt(athleteId, 11), runTransaction);
    await createTimelineEntry(coachId, eventId, attempt(athleteId, 11.4), runTransaction);

    const updated = await updateTimelineEntry(
      coachId,
      eventId,
      first.id,
      { expectedVersion: first.version, value: 11.5 },
      runTransaction,
    );
    expect(updated).toMatchObject({ value: 11.5, version: 2 });
    const { rows } = await pool.query(
      `SELECT final_result FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    expect(rows[0].final_result).toBe('11.4');
  });

  it('edits incidents and notes while preserving the original audit metadata', async () => {
    const coachId = await seedCoach('content-edits');
    const eventId = await seedEvent(coachId, 'Content edits');
    const athleteId = await seedAthlete(coachId, 'Content Runner');
    const finish = await createTimelineEntry(
      coachId,
      eventId,
      attempt(athleteId, 10.9),
      runTransaction,
    );
    const note = await createTimelineEntry(coachId, eventId, {
      ...attempt(athleteId, 10.9),
      entryType: 'note',
      value: null,
      unit: null,
      noteText: 'Check start',
    }, runTransaction);

    const incident = await updateTimelineEntry(
      coachId,
      eventId,
      finish.id,
      { expectedVersion: finish.version, value: null, incidentType: 'dq' },
      runTransaction,
    );
    expect(incident).toMatchObject({ incidentType: 'dq', value: null, version: 2 });

    const correctedNote = await updateTimelineEntry(
      coachId,
      eventId,
      note.id,
      { expectedVersion: note.version, noteText: 'Check reaction time' },
      runTransaction,
    );
    expect(correctedNote).toMatchObject({
      noteText: 'Check reaction time',
      recordedBy: coachId,
      deviceId: null,
      version: 2,
    });
    expect(correctedNote.updatedAt).not.toBe(correctedNote.createdAt);
  });

  it('rejects stale edits and deletes without changing persisted state', async () => {
    const coachId = await seedCoach('stale');
    const eventId = await seedEvent(coachId, 'Stale');
    const athleteId = await seedAthlete(coachId, 'Stale Runner');
    const entry = await createTimelineEntry(coachId, eventId, attempt(athleteId, 11.2), runTransaction);
    const corrected = await updateTimelineEntry(
      coachId,
      eventId,
      entry.id,
      { expectedVersion: entry.version, value: 11.1 },
      runTransaction,
    );

    await expect(updateTimelineEntry(
      coachId,
      eventId,
      entry.id,
      { expectedVersion: entry.version, value: 12 },
      runTransaction,
    )).rejects.toMatchObject({ status: 409, code: 'TIMELINE_ENTRY_VERSION_CONFLICT' });
    await expect(removeTimelineEntry(
      coachId,
      eventId,
      entry.id,
      { expectedVersion: entry.version },
      runTransaction,
    )).rejects.toMatchObject({ status: 409, code: 'TIMELINE_ENTRY_VERSION_CONFLICT' });

    const persisted = await pool.query(
      `SELECT value, version, deleted_at FROM timeline_entries WHERE id = $1`,
      [entry.id],
    );
    expect(persisted.rows[0]).toEqual({ value: '11.1', version: corrected.version, deleted_at: null });
  });

  it('voids a result for DQ and restores it when the incident is soft-deleted', async () => {
    const coachId = await seedCoach('undo');
    const eventId = await seedEvent(coachId, 'Undo');
    const athleteId = await seedAthlete(coachId, 'Casey Runner');
    await createTimelineEntry(coachId, eventId, attempt(athleteId, 10.9), runTransaction);
    const dq = await createTimelineEntry(coachId, eventId, {
      ...attempt(athleteId, 10.9),
      entryType: 'penalty',
      value: null,
      unit: null,
      incidentType: 'dq',
    }, runTransaction);

    let result = await pool.query(
      `SELECT outcome, final_result, "placing" AS placing FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    expect(result.rows[0]).toEqual({ outcome: 'dq', final_result: null, placing: null });

    await removeTimelineEntry(coachId, eventId, dq.id, { expectedVersion: dq.version }, runTransaction);
    result = await pool.query(
      `SELECT outcome, final_result, "placing" AS placing FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    expect(result.rows[0]).toEqual({ outcome: 'valid', final_result: '10.9', placing: 1 });
    const tombstone = await pool.query(
      `SELECT version, deleted_at FROM timeline_entries WHERE id = $1`,
      [dq.id],
    );
    expect(tombstone.rows[0].version).toBe(2);
    expect(tombstone.rows[0].deleted_at).not.toBeNull();

    const deletedAt = tombstone.rows[0].deleted_at;
    await pool.query(`UPDATE events SET status = 'completed' WHERE id = $1`, [eventId]);
    await removeTimelineEntry(coachId, eventId, dq.id, { expectedVersion: dq.version }, runTransaction);
    const repeated = await pool.query(
      `SELECT version, deleted_at FROM timeline_entries WHERE id = $1`,
      [dq.id],
    );
    expect(repeated.rows[0]).toEqual({ version: 2, deleted_at: deletedAt });
    await expect(listTimelineEntries(coachId, eventId, pool)).resolves.toEqual([
      expect.objectContaining({ value: 10.9, deletedAt: null }),
    ]);
  });

  it('rejects mismatched parents and cross-coach timeline mutations', async () => {
    const coachId = await seedCoach('mutation-owner');
    const otherCoachId = await seedCoach('mutation-other');
    const eventId = await seedEvent(coachId, 'Owned');
    const otherEventId = await seedEvent(coachId, 'Wrong parent');
    const athleteId = await seedAthlete(coachId, 'Owned Runner');
    const entry = await createTimelineEntry(coachId, eventId, attempt(athleteId, 11.2), runTransaction);

    await expect(updateTimelineEntry(
      coachId,
      otherEventId,
      entry.id,
      { expectedVersion: entry.version, value: 11.1 },
      runTransaction,
    )).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(removeTimelineEntry(
      otherCoachId,
      eventId,
      entry.id,
      { expectedVersion: entry.version },
      runTransaction,
    )).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    const persisted = await pool.query(
      `SELECT value, version, deleted_at FROM timeline_entries WHERE id = $1`,
      [entry.id],
    );
    expect(persisted.rows[0]).toEqual({ value: '11.2', version: 1, deleted_at: null });
  });

  it('preserves override audit and effective statistics when the derived attempt is undone', async () => {
    const coachId = await seedCoach('override');
    const eventId = await seedEvent(coachId, 'Override');
    const athleteId = await seedAthlete(coachId, 'Dana Runner');
    const entry = await createTimelineEntry(coachId, eventId, attempt(athleteId, 11.2), runTransaction);
    await pool.query(
      `UPDATE results
       SET manual_override = 10.8,
           override_reason = 'Photo finish',
           overridden_by = $1,
           override_at = now()
       WHERE event_id = $2 AND athlete_id = $3`,
      [coachId, eventId, athleteId],
    );

    await removeTimelineEntry(
      coachId,
      eventId,
      entry.id,
      { expectedVersion: entry.version },
      runTransaction,
    );
    const { rows } = await pool.query<ResultRow>(
      `SELECT event_id, athlete_id, discipline, outcome, final_result, unit, "placing" AS placing,
              is_pb, is_sb, manual_override, override_reason, overridden_by, override_at, updated_at
       FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [eventId, athleteId],
    );
    expect(mapResultRow(rows[0])).toMatchObject({
      outcome: 'no_result',
      finalResult: null,
      manualOverride: 10.8,
      placing: 1,
      isPb: true,
      isSb: true,
      overrideReason: 'Photo finish',
      overriddenBy: coachId,
    });
  });

  it('reranks the event and recalculates chronological PB/SB flags', async () => {
    const coachId = await seedCoach('rank');
    const eventId = await seedEvent(coachId, 'Ranking');
    const ariId = await seedAthlete(coachId, 'Ari Runner');
    const beaId = await seedAthlete(coachId, 'Bea Runner');
    await createTimelineEntry(coachId, eventId, attempt(ariId, 11.2), runTransaction);
    await createTimelineEntry(coachId, eventId, attempt(beaId, 10.9), runTransaction);

    const placing = await pool.query(
      `SELECT athlete_id, "placing" AS placing FROM results WHERE event_id = $1 ORDER BY athlete_id`,
      [eventId],
    );
    expect(Object.fromEntries(placing.rows.map((row) => [row.athlete_id, row.placing]))).toEqual({
      [ariId]: 2,
      [beaId]: 1,
    });

    const futureId = await seedEvent(coachId, 'Future', 'competition', 'in_progress', '2026-10-01');
    await createTimelineEntry(coachId, futureId, attempt(ariId, 11.4), runTransaction);
    const flags = await pool.query(
      `SELECT is_pb, is_sb FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [futureId, ariId],
    );
    expect(flags.rows[0]).toEqual({ is_pb: false, is_sb: false });
  });

  it('recomputes results when event type changes and PB/SB when it is cancelled', async () => {
    const coachId = await seedCoach('event-change');
    const eventId = await seedEvent(coachId, 'Mutable', 'competition', 'in_progress', '2026-09-01');
    const futureId = await seedEvent(coachId, 'Future', 'competition', 'in_progress', '2026-10-01');
    const athleteId = await seedAthlete(coachId, 'Erin Runner');
    await createTimelineEntry(coachId, eventId, attempt(athleteId, 11), runTransaction);
    await createTimelineEntry(coachId, eventId, attempt(athleteId, 11.5), runTransaction);
    await createTimelineEntry(coachId, futureId, attempt(athleteId, 11.2), runTransaction);

    await replaceEvent(coachId, eventId, {
      type: 'training',
      discipline: '100m',
      title: 'Sprint Mutable',
      date: '2026-09-01',
      time: null,
      locationName: null,
      latitude: null,
      longitude: null,
      status: 'in_progress',
    }, runTransaction);
    let rows = await pool.query(
      `SELECT event_id, final_result, is_pb FROM results
       WHERE athlete_id = $1 ORDER BY event_id`,
      [athleteId],
    );
    expect(rows.rows.find((row) => row.event_id === eventId)).toMatchObject({ final_result: '11', is_pb: true });
    expect(rows.rows.find((row) => row.event_id === futureId)).toMatchObject({ final_result: '11.2', is_pb: false });

    await cancelEvent(coachId, eventId, runTransaction);
    rows = await pool.query(
      `SELECT event_id, "placing" AS placing, is_pb, is_sb FROM results
       WHERE athlete_id = $1 ORDER BY event_id`,
      [athleteId],
    );
    expect(rows.rows.find((row) => row.event_id === eventId)).toMatchObject({ placing: null, is_pb: false, is_sb: false });
    expect(rows.rows.find((row) => row.event_id === futureId)).toMatchObject({ is_pb: true, is_sb: true });
  });

  it('rejects non-live and cross-coach logging without creating rows', async () => {
    const coachId = await seedCoach('owner');
    const otherCoachId = await seedCoach('other');
    const scheduledId = await seedEvent(coachId, 'Scheduled', 'competition', 'scheduled');
    const athleteId = await seedAthlete(coachId, 'Ari Runner');
    const otherAthleteId = await seedAthlete(otherCoachId, 'Other Runner');

    await expect(
      createTimelineEntry(coachId, scheduledId, attempt(athleteId, 11.2), runTransaction),
    ).rejects.toMatchObject({ status: 409, code: 'EVENT_NOT_IN_PROGRESS' });
    const liveId = await seedEvent(coachId, 'Live');
    await expect(
      createTimelineEntry(coachId, liveId, attempt(otherAthleteId, 11.2), runTransaction),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    const entries = await pool.query(`SELECT 1 FROM timeline_entries`);
    expect(entries.rowCount).toBe(0);
  });
});
