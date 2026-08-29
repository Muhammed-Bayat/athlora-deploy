import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import type { DbExecutor } from '../db/client.js';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import { deleteCurrentAccount } from './accounts.js';

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

describeDB('account deletion against a real database', () => {
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

  async function seedWorkspace(suffix: string) {
    const auth0Id = `auth0|account-${suffix}`;
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (auth0_id, name, email) VALUES ($1, $2, $3) RETURNING id`,
      [auth0Id, `Coach ${suffix}`, `${suffix}@example.com`],
    );
    const userId = user.rows[0].id;
    const athlete = await pool.query<{ id: string }>(
      `INSERT INTO athletes (coach_id, name) VALUES ($1, $2) RETURNING id`,
      [userId, `Athlete ${suffix}`],
    );
    const event = await pool.query<{ id: string }>(
      `INSERT INTO events (created_by, type, discipline, title, date, status)
       VALUES ($1, 'competition', '100m', $2, '2026-09-01', 'completed') RETURNING id`,
      [userId, `Event ${suffix}`],
    );
    const athleteId = athlete.rows[0].id;
    const eventId = event.rows[0].id;
    await pool.query(
      `INSERT INTO event_participants (event_id, athlete_id) VALUES ($1, $2)`,
      [eventId, athleteId],
    );
    await pool.query(
      `INSERT INTO timeline_entries
         (event_id, athlete_id, discipline, entry_type, value, unit, recorded_by)
       VALUES ($1, $2, '100m', 'attempt', 11.2, 'seconds', $3)`,
      [eventId, athleteId, userId],
    );
    await pool.query(
      `INSERT INTO results
         (event_id, athlete_id, discipline, outcome, final_result, unit)
       VALUES ($1, $2, '100m', 'valid', 11.2, 'seconds')`,
      [eventId, athleteId],
    );
    return { auth0Id, userId, athleteId, eventId };
  }

  it('purges one complete workspace while preserving another coach and a durable tombstone', async () => {
    const target = await seedWorkspace('target');
    const other = await seedWorkspace('other');
    await pool.query(
      `INSERT INTO timeline_entries
         (event_id, athlete_id, discipline, entry_type, value, unit, recorded_by)
       VALUES ($1, $2, '100m', 'attempt', 11.1, 'seconds', $3)`,
      [other.eventId, other.athleteId, target.userId],
    );
    await pool.query(
      `UPDATE results SET manual_override = 11.1, override_reason = 'Photo finish',
         overridden_by = $1, override_at = now()
       WHERE event_id = $2 AND athlete_id = $3 AND discipline = '100m'`,
      [target.userId, other.eventId, other.athleteId],
    );
    await pool.query(
      `INSERT INTO event_participants (event_id, athlete_id) VALUES ($1, $2)`,
      [other.eventId, target.athleteId],
    );
    await pool.query(
      `INSERT INTO timeline_entries
         (event_id, athlete_id, discipline, entry_type, value, unit, recorded_by)
       VALUES ($1, $2, '100m', 'attempt', 10.9, 'seconds', $3)`,
      [other.eventId, target.athleteId, other.userId],
    );
    await pool.query(
      `INSERT INTO results
         (event_id, athlete_id, discipline, outcome, final_result, unit, "placing")
       VALUES ($1, $2, '100m', 'valid', 10.9, 'seconds', 1)`,
      [other.eventId, target.athleteId],
    );
    const deleteIdentity = vi.fn().mockResolvedValue(undefined);

    await deleteCurrentAccount(target.auth0Id, deleteIdentity, runTransaction);

    expect(deleteIdentity).toHaveBeenCalledWith(target.auth0Id);
    for (const [table, column, value] of [
      ['users', 'id', target.userId],
      ['athletes', 'id', target.athleteId],
      ['events', 'id', target.eventId],
      ['event_participants', 'event_id', target.eventId],
      ['timeline_entries', 'event_id', target.eventId],
      ['results', 'event_id', target.eventId],
    ]) {
      const row = await pool.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [value]);
      expect(row.rowCount).toBe(0);
    }
    expect((await pool.query(`SELECT 1 FROM users WHERE id = $1`, [other.userId])).rowCount).toBe(1);
    expect((await pool.query(
      `SELECT 1 FROM timeline_entries WHERE event_id = $1 AND recorded_by = $2`,
      [other.eventId, target.userId],
    )).rowCount).toBe(0);
    const preservedResult = await pool.query(
      `SELECT final_result, "placing", manual_override, override_reason, overridden_by, override_at
       FROM results WHERE event_id = $1 AND athlete_id = $2`,
      [other.eventId, other.athleteId],
    );
    expect(preservedResult.rows[0].overridden_by).toBeNull();
    expect(Number(preservedResult.rows[0].final_result)).toBe(11.2);
    expect(preservedResult.rows[0].placing).toBe(1);
    expect(preservedResult.rows[0].manual_override).toBeNull();
    expect(preservedResult.rows[0].override_reason).toBeNull();
    expect(preservedResult.rows[0].override_at).toBeNull();
    const deletion = await pool.query(
      `SELECT status, completed_at FROM account_deletions WHERE auth0_id = $1`,
      [target.auth0Id],
    );
    expect(deletion.rows[0].status).toBe('completed');
    expect(deletion.rows[0].completed_at).not.toBeNull();
  });
});
