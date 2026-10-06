import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import type { MeetActor } from '../types/meets.js';
import { replaceEvent } from './events.js';
import {
  changeSessionState,
  createEntrant,
  createSession,
  listDisciplines,
  registerEntrant,
  type MeetTransaction,
} from './meets.js';
import { createSessionEntry, listSessionResults, selectSessionResultEntry } from './sessionPerformances.js';
import { getAthleteStatisticsDetail } from './statistics.js';

const describeDB = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const timed = { entryType: 'attempt' as const, unit: 'seconds' as const, isFoul: false, incidentType: null, noteText: null, deviceId: 'test-device' };

// TEST_DATABASE_URL MUST be disposable: each test drops and re-migrates the schema.
describeDB('athlete recent results against a real database', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;
  let host: Extract<MeetActor, { userId: string }>;
  let athleteId: string;
  let eventId: string;
  const transaction: MeetTransaction = async (operation) => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await operation(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally { db.release(); }
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    migrations = await loadMigrations();
  });
  afterAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.end();
  });
  beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await transaction((db) => applyMigrations(db, migrations));
    const user = await pool.query("INSERT INTO users (auth0_id, name, email) VALUES ('auth|Host','Host','host@test.example') RETURNING id");
    const workspace = await pool.query("INSERT INTO workspaces (name) VALUES ('Host') RETURNING id");
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'coach')", [workspace.rows[0].id, user.rows[0].id]);
    host = { userId: user.rows[0].id as string, workspaceId: workspace.rows[0].id as string, role: 'coach' as const };
    const athlete = await pool.query('INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1,$2,$3) RETURNING id', [host.workspaceId, host.userId, 'Aria Sprinter']);
    athleteId = athlete.rows[0].id;
    await pool.query(
      `INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id)
       SELECT $1, id FROM discipline_definitions`,
      [athleteId],
    );
    const event = await pool.query(
      "INSERT INTO events (workspace_id, created_by, type, discipline, title, date) VALUES ($1,$2,'competition','100m','Meet','2026-09-01') RETURNING id",
      [host.workspaceId, host.userId],
    );
    eventId = event.rows[0].id;
  });

  async function definition(code: string) {
    return (await listDisciplines(pool)).find((row) => row.code === code)!;
  }

  it('shows the relay team, its squad order, and every leg split as one row of the same event', async () => {
    const athleteEntrant = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const guests = await Promise.all(['A', 'B', 'C'].map((name) => createEntrant(host, eventId, { kind: 'guest', name, clubName: null, details: null }, transaction)));
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: "Pook's relay team", memberIds: [athleteEntrant.id, ...guests.map((row) => row.id)] }, transaction);
    const memberIds = (await pool.query<{ id: string }>('SELECT id FROM relay_members WHERE relay_id = $1 ORDER BY leg', [relay.id])).rows.map((row) => row.id);
    expect(memberIds).toHaveLength(4);

    const relaySession = await createSession(host, eventId, { disciplineDefinitionId: (await definition('4x100m')).id, label: '4x100 Final' }, transaction);
    const target = { disciplineSessionId: relaySession.id, entrantId: relay.id };
    await registerEntrant(host, eventId, target, transaction);
    await pool.query("UPDATE events SET status = 'in_progress' WHERE id = $1", [eventId]);
    await changeSessionState(host, eventId, relaySession.id, { status: 'in_progress', expectedVersion: 1 }, transaction);

    const splits = [9.5, 10, 8.7, 9.95];
    const entries = [];
    for (const [index, relayMemberId] of memberIds.entries()) {
      entries.push(await createSessionEntry(host, eventId, target, { ...timed, value: splits[index], relayMemberId }, transaction));
    }
    for (const [index, relayMemberId] of memberIds.entries()) {
      const resultVersion = async () => (await listSessionResults(host, eventId, relaySession.id, pool))
        .find((row) => row.entrantId === relay.id)!.version;
      await selectSessionResultEntry(
        host,
        eventId,
        target,
        { entryId: entries[index].id, expectedVersion: await resultVersion(), relayMemberId },
        transaction,
      );
    }
    const teamResult = (await listSessionResults(host, eventId, relaySession.id, pool))
      .find((row) => row.entrantId === relay.id)!;
    expect(teamResult).toMatchObject({ finalResult: 38.15, effectiveOutcome: 'valid' });

    await changeSessionState(host, eventId, relaySession.id, { status: 'completed', expectedVersion: 2 }, transaction);
    await pool.query("UPDATE events SET status = 'completed' WHERE id = $1", [eventId]);

    const statistics = await getAthleteStatisticsDetail(host.workspaceId, athleteId, '2026-09-01', transaction);
    const relayRows = statistics.recentResults.competitions.filter((entry) => entry.event.id === eventId);
    expect(relayRows).toHaveLength(1);
    const row = relayRows[0];
    expect(row).toMatchObject({ effectiveResult: 38.15, effectiveOutcome: 'valid', countsTowardsStatistics: true, note: null });
    expect(row.result.discipline).toBe('4x100m');
    expect(row.relay).toMatchObject({
      teamName: "Pook's relay team",
      members: ['Aria Sprinter', 'A', 'B', 'C'],
      legs: [
        { leg: 1, name: 'Aria Sprinter', value: 9.5 },
        { leg: 2, name: 'A', value: 10 },
        { leg: 3, name: 'B', value: 8.7 },
        { leg: 4, name: 'C', value: 9.95 },
      ],
    });
  });

  it('fabricates no legacy result for a multi-discipline meet and never shows one', async () => {
    const meet = await pool.query(
      "INSERT INTO events (workspace_id, created_by, type, discipline, title, date) VALUES ($1,$2,'competition',NULL,'Multi-club Meet','2026-09-02') RETURNING id",
      [host.workspaceId, host.userId],
    );
    const meetEventId = meet.rows[0].id as string;
    await pool.query(
      "INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id, rsvp_status) VALUES ($1,$2,$3,'yes')",
      [meetEventId, athleteId, host.workspaceId],
    );
    await pool.query("UPDATE events SET status = 'in_progress' WHERE id = $1", [meetEventId]);

    await replaceEvent(host.workspaceId, meetEventId, {
      type: 'competition',
      discipline: null,
      title: 'Multi-club Meet',
      date: '2026-09-02',
      time: null,
      locationName: null,
      latitude: null,
      longitude: null,
      status: 'completed',
    }, transaction);

    expect((await pool.query('SELECT athlete_id FROM results WHERE event_id = $1', [meetEventId])).rows).toEqual([]);

    // A row written by an older build is still kept out of the log.
    await pool.query(
      "INSERT INTO results (event_id, athlete_id, discipline, outcome, final_result, unit) VALUES ($1,$2,'100m','no_result',NULL,NULL)",
      [meetEventId, athleteId],
    );
    const statistics = await getAthleteStatisticsDetail(host.workspaceId, athleteId, '2026-09-01', transaction);
    const rows = [...statistics.recentResults.competitions, ...statistics.recentResults.training];
    expect(rows.some((entry) => entry.event.id === meetEventId)).toBe(false);
  });
});
