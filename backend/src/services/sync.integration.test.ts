import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import { processSyncBatch, type SyncActionInput } from './sync.js';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;
const TABLES = [
  ...MEET_TEST_TABLES,
  'sync_action_receipts',
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

describeDB('processSyncBatch against a real database', () => {
  let pool: pg.Pool;

  beforeEach(async () => {
    pool = new pg.Pool({ connectionString });
    const client = await pool.connect();
    try {
      const migrations = await loadMigrations();
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
      [`auth0|sync-${suffix}`, `Coach ${suffix}`, `sync-${suffix}@example.com`],
    );
    return rows[0].id;
  }

  async function seedEvent(coachId: string, status = 'in_progress'): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO events (created_by, type, discipline, title, date, status)
       VALUES ($1, 'competition', '100m', 'Sync Batch Meet', '2026-09-01', $2)
       RETURNING id`,
      [coachId, status],
    );
    return rows[0].id;
  }

  async function seedAthlete(coachId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO athletes (workspace_id, coach_id, name)
       VALUES ($1, $1, 'Sync Runner')
       RETURNING id`,
      [coachId],
    );
    return rows[0].id;
  }

  function createBatchAction(actionId: string, athleteId: string, value: number): SyncActionInput {
    return {
      actionId,
      actionType: 'create_entry',
      payload: {
        athleteId,
        discipline: '100m',
        entryType: 'attempt',
        value,
        unit: 'seconds',
      },
      clientTimestamp: new Date().toISOString(),
    };
  }

  it('is idempotent: retrying the same actionId returns duplicate and does not create a second entry', async () => {
    const coachId = await seedCoach('idem');
    const eventId = await seedEvent(coachId);
    const athleteId = await seedAthlete(coachId);
    const actionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const action = createBatchAction(actionId, athleteId, 11.2);

    const first = await processSyncBatch(eventId, coachId, 'device-1', [action]);
    expect(first.receipts[0]).toMatchObject({ actionId, status: 'accepted' });
    expect(first.recomputedResults).toBe(true);

    const second = await processSyncBatch(eventId, coachId, 'device-1', [action]);
    expect(second.receipts[0]).toMatchObject({ actionId, status: 'duplicate' });
    expect(second.recomputedResults).toBe(false);

    const { rows } = await pool.query(
      'SELECT id FROM timeline_entries WHERE event_id = $1',
      [eventId],
    );
    expect(rows).toHaveLength(1);

    const receipts = await pool.query(
      'SELECT status FROM sync_action_receipts WHERE action_id = $1',
      [actionId],
    );
    expect(receipts.rows).toHaveLength(1);
    expect(receipts.rows[0].status).toBe('accepted');
  });

  it('keeps rejected actions visible on retry without blocking accepted siblings', async () => {
    const coachId = await seedCoach('mixed');
    const eventId = await seedEvent(coachId);
    const athleteId = await seedAthlete(coachId);
    const goodId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const staleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    const good = createBatchAction(goodId, athleteId, 11.0);
    const staleEdit: SyncActionInput = {
      actionId: staleId,
      actionType: 'edit_entry',
      payload: {
        entryId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        value: 10.5,
        expectedVersion: 99,
      },
      expectedVersion: 99,
      clientTimestamp: new Date().toISOString(),
    };

    const first = await processSyncBatch(eventId, coachId, 'device-1', [good, staleEdit]);
    expect(first.receipts).toEqual([
      expect.objectContaining({ actionId: goodId, status: 'accepted' }),
      expect.objectContaining({ actionId: staleId, status: 'rejected', code: 'VERSION_CONFLICT' }),
    ]);

    const retry = await processSyncBatch(eventId, coachId, 'device-1', [good, staleEdit]);
    expect(retry.receipts).toEqual([
      expect.objectContaining({ actionId: goodId, status: 'duplicate' }),
      expect.objectContaining({ actionId: staleId, status: 'rejected', code: 'VERSION_CONFLICT' }),
    ]);

    const { rows } = await pool.query(
      'SELECT id FROM timeline_entries WHERE event_id = $1',
      [eventId],
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects the whole batch with EVENT_NOT_IN_PROGRESS when the event is completed', async () => {
    const coachId = await seedCoach('closed');
    const eventId = await seedEvent(coachId, 'completed');
    const athleteId = await seedAthlete(coachId);
    const actionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const result = await processSyncBatch(eventId, coachId, 'device-1', [
      createBatchAction(actionId, athleteId, 11.4),
    ]);

    expect(result.receipts[0]).toMatchObject({
      actionId,
      status: 'rejected',
      code: 'EVENT_NOT_IN_PROGRESS',
    });
    expect(result.recomputedResults).toBe(false);

    const { rows } = await pool.query(
      'SELECT id FROM timeline_entries WHERE event_id = $1',
      [eventId],
    );
    expect(rows).toHaveLength(0);
  });
});
import { MEET_TEST_TABLES } from '../db/meet-test-tables.js';
