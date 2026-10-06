import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbExecutor } from '../db/client.js';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import type { TimelineEntryCreatePayload } from '../validation/payloads.js';
import { createPublicLoggerEntry, createPublicLoggerLink, createPublicLoggerSession, listPublicLoggerLinks, revokePublicLoggerLink } from './publicLoggers.js';

const describeDB = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const entryPayload: TimelineEntryCreatePayload = {
  athleteId: '',
  discipline: '100m',
  entryType: 'attempt',
  value: 11.4,
  unit: 'seconds',
  isFoul: false,
  incidentType: null,
  noteText: null,
  deviceId: null,
};

describeDB('public logger service against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;
  let host: { userId: string; workspaceId: string };
  let invited: { userId: string; workspaceId: string };
  let outsider: { userId: string; workspaceId: string };
  let eventId: string;

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

    const actors: Array<{ userId: string; workspaceId: string }> = [];
    for (const name of ['Host', 'Invited', 'Outsider']) {
      const user = await pool.query("INSERT INTO users (auth0_id, name, email) VALUES ($1,$2,$3) RETURNING id", [`auth|${name}`, name, `${name}@test.example`]);
      const workspace = await pool.query('INSERT INTO workspaces (name) VALUES ($1) RETURNING id', [name]);
      await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'coach')", [workspace.rows[0].id, user.rows[0].id]);
      actors.push({ userId: user.rows[0].id as string, workspaceId: workspace.rows[0].id as string });
    }
    [host, invited, outsider] = actors;
    const event = await pool.query("INSERT INTO events (workspace_id, created_by, type, discipline, title, date) VALUES ($1,$2,'competition','100m','Meet','2026-09-01') RETURNING id", [host.workspaceId, host.userId]);
    eventId = event.rows[0].id;
    await pool.query("INSERT INTO event_fixture_workspaces (event_id,workspace_id,role,status,contact_email,joined_by) VALUES ($1,$2,'guest','accepted','invited@test.example',$3)", [eventId, invited.workspaceId, invited.userId]);
  });

  afterAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.end();
  });

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

  it('lets the host create, list and revoke links for a scheduled event', async () => {
    const created = await createPublicLoggerLink(host.workspaceId, eventId, host.userId, pool);
    expect(created.link).toMatchObject({ status: 'active', eventId });
    expect(created.token).toHaveLength(43);

    const [link] = await listPublicLoggerLinks(host.workspaceId, eventId, pool);
    expect(link.id).toBe(created.link.id);

    await revokePublicLoggerLink(host.workspaceId, eventId, link.id, pool);
    expect((await listPublicLoggerLinks(host.workspaceId, eventId, pool))[0]).toMatchObject({ status: 'revoked' });
    await expect(revokePublicLoggerLink(host.workspaceId, eventId, link.id, pool)).rejects.toMatchObject({ status: 404 });
  });

  it('lets an invited coach create, list and revoke links for the fixture event', async () => {
    const hostLink = await createPublicLoggerLink(host.workspaceId, eventId, host.userId, pool);
    const invitedLink = await createPublicLoggerLink(invited.workspaceId, eventId, invited.userId, pool);
    expect(invitedLink.link).toMatchObject({ status: 'active' });

    const links = await listPublicLoggerLinks(invited.workspaceId, eventId, pool);
    expect(links.map((row) => row.id).sort()).toEqual([hostLink.link.id, invitedLink.link.id].sort());

    await revokePublicLoggerLink(invited.workspaceId, eventId, hostLink.link.id, pool);
    expect((await listPublicLoggerLinks(host.workspaceId, eventId, pool)).find((row) => row.id === hostLink.link.id)).toMatchObject({ status: 'revoked' });
    expect((await listPublicLoggerLinks(invited.workspaceId, eventId, pool)).find((row) => row.id === invitedLink.link.id)).toMatchObject({ status: 'active' });
  });

  it('blocks a coach without event access from creating, listing or revoking links', async () => {
    const hostLink = await createPublicLoggerLink(host.workspaceId, eventId, host.userId, pool);

    await expect(createPublicLoggerLink(outsider.workspaceId, eventId, outsider.userId, pool))
      .rejects.toMatchObject({ status: 409, code: 'PUBLIC_LOGGER_LINK_UNAVAILABLE' });
    expect(await listPublicLoggerLinks(outsider.workspaceId, eventId, pool)).toEqual([]);
    await expect(revokePublicLoggerLink(outsider.workspaceId, eventId, hostLink.link.id, pool)).rejects.toMatchObject({ status: 404 });

    expect((await listPublicLoggerLinks(host.workspaceId, eventId, pool))[0]).toMatchObject({ status: 'active' });
  });

  it('drops an invited coach link access when the fixture acceptance goes stale or is retracted', async () => {
    await createPublicLoggerLink(invited.workspaceId, eventId, invited.userId, pool);

    await pool.query('UPDATE events SET fixture_revision = fixture_revision + 1 WHERE id = $1', [eventId]);
    await expect(createPublicLoggerLink(invited.workspaceId, eventId, invited.userId, pool)).rejects.toMatchObject({ status: 409, code: 'PUBLIC_LOGGER_LINK_UNAVAILABLE' });
    expect(await listPublicLoggerLinks(invited.workspaceId, eventId, pool)).toEqual([]);

    await pool.query('UPDATE events SET fixture_revision = fixture_revision - 1 WHERE id = $1', [eventId]);
    await pool.query("UPDATE event_fixture_workspaces SET status = 'reacceptance_required' WHERE event_id = $1 AND workspace_id = $2", [eventId, invited.workspaceId]);
    await expect(createPublicLoggerLink(invited.workspaceId, eventId, invited.userId, pool)).rejects.toMatchObject({ status: 409 });
    expect(await listPublicLoggerLinks(invited.workspaceId, eventId, pool)).toEqual([]);
    expect(await listPublicLoggerLinks(host.workspaceId, eventId, pool)).toHaveLength(1);
  });

  it('stamps the event discipline on logged entries and their derived results', async () => {
    await pool.query("UPDATE events SET status = 'in_progress' WHERE id = $1", [eventId]);
    const athlete = await pool.query(
      'INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1, $2, $3) RETURNING id',
      [host.workspaceId, host.userId, 'Sprinter'],
    );
    const athleteId: string = athlete.rows[0].id;
    await pool.query(
      'INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id) VALUES ($1, $2, $3)',
      [eventId, athleteId, host.workspaceId],
    );

    const link = await createPublicLoggerLink(host.workspaceId, eventId, host.userId, pool);
    const { sessionToken } = await createPublicLoggerSession(link.token, 'Meet Official', 'City Track Club', pool);

    const entry = await createPublicLoggerEntry(
      sessionToken,
      eventId,
      { ...entryPayload, athleteId },
      runTransaction,
    );

    expect(entry.discipline).toBe('100m');
    const logged = await pool.query('SELECT discipline FROM timeline_entries WHERE event_id = $1', [eventId]);
    expect(logged.rows.map((row) => row.discipline)).toEqual(['100m']);
    const derived = await pool.query('SELECT discipline FROM results WHERE event_id = $1', [eventId]);
    expect(derived.rows.map((row) => row.discipline)).toEqual(['100m']);
  });

  it('refuses to log an entry for a multi-discipline event', async () => {
    const generic = await pool.query(
      `INSERT INTO events (workspace_id, created_by, type, discipline, title, date, status)
       VALUES ($1, $2, 'competition', NULL, 'Combined Meet', '2026-09-02', 'in_progress') RETURNING id`,
      [host.workspaceId, host.userId],
    );
    const genericEventId: string = generic.rows[0].id;
    const athlete = await pool.query(
      'INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1, $2, $3) RETURNING id',
      [host.workspaceId, host.userId, 'Jumper'],
    );
    const athleteId: string = athlete.rows[0].id;
    await pool.query(
      'INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id) VALUES ($1, $2, $3)',
      [genericEventId, athleteId, host.workspaceId],
    );

    const link = await createPublicLoggerLink(host.workspaceId, genericEventId, host.userId, pool);
    const { sessionToken } = await createPublicLoggerSession(link.token, 'Meet Official', 'City Track Club', pool);

    await expect(
      createPublicLoggerEntry(sessionToken, genericEventId, { ...entryPayload, athleteId }, runTransaction),
    ).rejects.toMatchObject({ status: 409, code: 'DISCIPLINE_UNSUPPORTED' });

    const logged = await pool.query('SELECT count(*)::int AS count FROM timeline_entries WHERE event_id = $1', [genericEventId]);
    expect(logged.rows[0].count).toBe(0);
  });
});
