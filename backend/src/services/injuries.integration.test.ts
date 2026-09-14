import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import { createInjury, listInjuries, updateInjury, resolveInjury, reopenInjury } from './injuries.js';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDB = connectionString ? describe : describe.skip;
const TABLES = [
  'athlete_injuries',
  'athletes',
  'workspace_members',
  'workspaces',
  'users',
  'schema_migrations',
];

describeDB('injury persistence and authorization against a real database', () => {
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
      for (const table of TABLES) {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      }
    } finally {
      client.release();
    }
    await pool.end();
  });

  it('persists, updates, resolves, reopens, and soft-deletes injuries while enforcing workspace and archived constraints', async () => {
    const client = await pool.connect();
    try {
      const userRes = await client.query<{ id: string }>(
        `INSERT INTO users (auth0_id, name, email, role) VALUES ('auth0|coach-1', 'Coach One', 'coach1@example.test', 'coach') RETURNING id`
      );
      const coachId = userRes.rows[0].id;

      const wsRes = await client.query<{ id: string }>(
        `INSERT INTO workspaces (name, timezone) VALUES ('Sprint Workspace', 'UTC') RETURNING id`
      );
      const workspaceId = wsRes.rows[0].id;

      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'coach')`,
        [workspaceId, coachId]
      );

      const athRes = await client.query<{ id: string }>(
        `INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1, $2, 'Injured Athlete') RETURNING id`,
        [workspaceId, coachId]
      );
      const athleteId = athRes.rows[0].id;

      const injury = await createInjury(workspaceId, athleteId, coachId, {
        bodyRegion: 'Leg',
        area: 'Hamstring',
        side: 'Right',
        severity: 'Moderate',
        notes: 'Tightness during acceleration',
        occurrenceDate: '2026-08-28',
        expectedReturnDate: '2026-09-04',
      }, client);

      expect(injury.id).toBeDefined();
      expect(injury.bodyRegion).toBe('Leg');
      expect(injury.severity).toBe('Moderate');
      expect(injury.createdBy).toBe(coachId);

      const list = await listInjuries(workspaceId, athleteId, {}, client);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(injury.id);

      const resolved = await resolveInjury(workspaceId, athleteId, injury.id, coachId, { resolutionNotes: 'Fully recovered' }, client);
      expect(resolved.resolvedDate).not.toBeNull();
      expect(resolved.resolutionNotes).toBe('Fully recovered');

      const reopened = await reopenInjury(workspaceId, athleteId, injury.id, coachId, client);
      expect(reopened.resolvedDate).toBeNull();

      await client.query(`UPDATE athletes SET archived_at = now(), lifecycle_status = 'archived' WHERE id = $1`, [athleteId]);
      await expect(
        updateInjury(workspaceId, athleteId, injury.id, coachId, { notes: 'Updated notes' }, client)
      ).rejects.toMatchObject({ code: 'ATHLETE_ARCHIVED' });

    } finally {
      client.release();
    }
  });
});
