import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import { createPublicLoggerLink, createPublicLoggerSession } from './publicLoggers.js';
import { processPublicSyncBatch, type PublicSyncActionInput } from './publicSync.js';

const describeDB = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDB('public logger offline replay against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;
  let host: { userId: string; workspaceId: string };
  let athleteId: string;
  let eventId: string;

  const createEntryAction = (athlete: string): PublicSyncActionInput => ({
    actionId: randomUUID(),
    actionType: 'create_entry',
    payload: {
      athleteId: athlete,
      entryType: 'attempt',
      value: 11.4,
      unit: 'seconds',
      incidentType: null,
      noteText: null,
    },
    clientTimestamp: new Date('2026-09-01T10:00:00.000Z').toISOString(),
  });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    migrations = await loadMigrations();
  });

  beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await applyMigrations(client, migrations);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const user = await pool.query("INSERT INTO users (auth0_id, name, email) VALUES ($1, 'Host', 'host@test.example') RETURNING id", ['auth|Host']);
    const workspace = await pool.query("INSERT INTO workspaces (name) VALUES ('Track Club') RETURNING id");
    host = { userId: user.rows[0].id, workspaceId: workspace.rows[0].id };
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'coach')", [host.workspaceId, host.userId]);

    const athlete = await pool.query(
      'INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1, $2, $3) RETURNING id',
      [host.workspaceId, host.userId, 'Sprinter'],
    );
    athleteId = athlete.rows[0].id;

    const event = await pool.query(
      `INSERT INTO events (workspace_id, created_by, type, discipline, title, date, status)
       VALUES ($1, $2, 'competition', '100m', '100m Night', '2026-09-01', 'in_progress') RETURNING id`,
      [host.workspaceId, host.userId],
    );
    eventId = event.rows[0].id;
    await pool.query(
      'INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id) VALUES ($1, $2, $3)',
      [eventId, athleteId, host.workspaceId],
    );
  });

  afterAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.end();
  });

  it('replays legacy entries with the event discipline', async () => {
    const link = await createPublicLoggerLink(host.workspaceId, eventId, host.userId, pool);
    const { sessionToken } = await createPublicLoggerSession(link.token, 'Meet Official', 'City Track Club', pool);
    const action = createEntryAction(athleteId);

    const result = await processPublicSyncBatch(sessionToken, eventId, 'track-tablet-1', [action], pool);

    expect(result.receipts).toEqual([{ actionId: action.actionId, status: 'accepted', entryId: action.actionId, serverVersion: 1 }]);
    expect(result.recomputedResults).toBe(true);
    const logged = await pool.query('SELECT discipline FROM timeline_entries WHERE event_id = $1', [eventId]);
    expect(logged.rows.map((row) => row.discipline)).toEqual(['100m']);
    const derived = await pool.query('SELECT discipline FROM results WHERE event_id = $1', [eventId]);
    expect(derived.rows.map((row) => row.discipline)).toEqual(['100m']);
  });

  it('rejects replayed entries for a multi-discipline event', async () => {
    const generic = await pool.query(
      `INSERT INTO events (workspace_id, created_by, type, discipline, title, date, status)
       VALUES ($1, $2, 'competition', NULL, 'Combined Meet', '2026-09-01', 'in_progress') RETURNING id`,
      [host.workspaceId, host.userId],
    );
    const genericEventId: string = generic.rows[0].id;
    await pool.query(
      'INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id) VALUES ($1, $2, $3)',
      [genericEventId, athleteId, host.workspaceId],
    );

    const link = await createPublicLoggerLink(host.workspaceId, genericEventId, host.userId, pool);
    const { sessionToken } = await createPublicLoggerSession(link.token, 'Meet Official', 'City Track Club', pool);
    const action = createEntryAction(athleteId);

    const result = await processPublicSyncBatch(sessionToken, genericEventId, 'track-tablet-1', [action], pool);

    expect(result.receipts).toEqual([{ actionId: action.actionId, status: 'rejected', code: 'DISCIPLINE_UNSUPPORTED' }]);
    expect(result.recomputedResults).toBe(false);
    const logged = await pool.query('SELECT count(*)::int AS count FROM timeline_entries WHERE event_id = $1', [genericEventId]);
    expect(logged.rows[0].count).toBe(0);
    const receipt = await pool.query('SELECT status, error_code FROM public_sync_action_receipts WHERE action_id = $1', [action.actionId]);
    expect(receipt.rows[0]).toMatchObject({ status: 'rejected', error_code: 'DISCIPLINE_UNSUPPORTED' });
  });
});
