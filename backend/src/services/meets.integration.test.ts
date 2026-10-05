import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import type { MeetActor, SessionEntryInput, SessionTarget } from '../types/meets.js';
import { createEntrant, createSession, changeSessionState, listDisciplines, listEntrants, listEventFinalResults, listSessions, registerEntrant, updateEntrant, withdrawEntrant, type MeetTransaction } from './meets.js';
import { createSessionEntry, listSessionEntries, listSessionResults, mutateSessionEntry, overrideSessionResult, selectSessionResultEntry, sessionStatistics } from './sessionPerformances.js';
import { recomputeEventResults, listTimelineEntries, removeTimelineEntry } from './timeline.js';
import { mapTimelineEntryRow, type TimelineEntryRow } from '../db/row-mappers.js';
import { getAthleteStatisticsDetail } from './statistics.js';
import { processSessionSyncBatch, type SessionSyncAction } from './sessionSync.js';
import { disciplineAthleteStatistics } from './disciplineStatistics.js';
import { publicClubSessionResults } from './publicResults.js';

const describeDB = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const timed: SessionEntryInput = { entryType: 'attempt', value: 11.25, unit: 'seconds', isFoul: false, incidentType: null, noteText: null, deviceId: 'test-device' };

// TEST_DATABASE_URL MUST be disposable. Schema reset also detects accidental
// dependencies on old tests' fixture data or leftover tables/functions.
describeDB('multi-discipline migration and domain integration', () => {
  let pool: pg.Pool;
  let migrations: Awaited<ReturnType<typeof loadMigrations>>;
  let host: Extract<MeetActor, { userId: string }>;
  let other: Extract<MeetActor, { userId: string }>;
  let eventId: string;
  let athleteId: string;
  let otherAthleteId: string;
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
  beforeEach(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await transaction((db) => applyMigrations(db, migrations.filter(m => m.name < '0028_')));
    const actors = [];
    for (const name of ['Host', 'Other']) {
      const user = await pool.query("INSERT INTO users (auth0_id, name, email) VALUES ($1,$2,$3) RETURNING id", [`auth|${name}`, name, `${name}@test.example`]);
      const workspace = await pool.query('INSERT INTO workspaces (name) VALUES ($1) RETURNING id', [name]);
      await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'coach')", [workspace.rows[0].id, user.rows[0].id]);
      actors.push({ userId: user.rows[0].id as string, workspaceId: workspace.rows[0].id as string, role: 'coach' as const });
    }
    [host, other] = actors;
    const event = await pool.query("INSERT INTO events (workspace_id, created_by, type, discipline, title, date) VALUES ($1,$2,'competition','100m','Meet','2026-09-01') RETURNING id", [host.workspaceId, host.userId]);
    eventId = event.rows[0].id;
    const athlete = await pool.query('INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1,$2,$3),($4,$5,$6) RETURNING id', [host.workspaceId, host.userId, 'Host athlete', other.workspaceId, other.userId, 'Other athlete']);
    [athleteId, otherAthleteId] = athlete.rows.map((row) => row.id);
  });
  afterAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await pool.end();
  });

  async function setEventStatus(status: 'scheduled' | 'in_progress' | 'completed') {
    await pool.query('UPDATE events SET status = $1 WHERE id = $2', [status, eventId]);
  }
  async function migrate() {
    await transaction((db) => applyMigrations(db, migrations));
    await pool.query(
      `INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id)
       SELECT seeded.athlete_id, definition.id
       FROM unnest($1::uuid[]) AS seeded(athlete_id)
       CROSS JOIN discipline_definitions definition
       WHERE EXISTS (SELECT 1 FROM athletes a WHERE a.id = seeded.athlete_id)
       ON CONFLICT DO NOTHING`,
      [[athleteId, otherAthleteId]],
    );
  }
  async function definition(code = '100m') { return (await listDisciplines(pool)).find((row) => row.code === code)!; }
  async function session(code = '100m', label = 'Session') { return createSession(host, eventId, { disciplineDefinitionId: (await definition(code)).id, label }, transaction); }
  async function guest(name = 'Guest') { return createEntrant(host, eventId, { kind: 'guest', name, clubName: null, details: null }, transaction); }
  async function open(sessionId: string) {
    await pool.query("UPDATE events SET status = 'in_progress' WHERE id = $1", [eventId]);
    return changeSessionState(host, eventId, sessionId, { status: 'in_progress', expectedVersion: 1 }, transaction);
  }
  async function ready(): Promise<SessionTarget> {
    await migrate();
    const [s, en] = await Promise.all([session(), guest()]);
    const target = { disciplineSessionId: s.id, entrantId: en.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    return target;
  }
  it.each(['high_jump'])('logs, audits, finalizes and countbacks %s', async code => {
    await migrate();
    const s = await createSession(host, eventId, { disciplineDefinitionId: (await definition(code)).id, label: code, verticalConfig: { startingHeight: 1.5, heightIncrement: 0.05, failureLimit: 3, round: 'final' } }, transaction);
    const entrants = [await guest('First'), await guest('Tied'), await guest('Third')];
    for (const en of entrants) await registerEntrant(host, eventId, { disciplineSessionId: s.id, entrantId: en.id }, transaction);
    const opened = await open(s.id);
    for (const [index, en] of entrants.entries()) {
      const target = { disciplineSessionId: s.id, entrantId: en.id };
      const input = { ...timed, unit: 'metres' as const, value: 1.5 };
      if (index === 2) await createSessionEntry(host, eventId, target, { ...input, verticalState: 'failure' }, transaction);
      await createSessionEntry(host, eventId, target, { ...input, verticalState: 'clearance' }, transaction);
      await createSessionEntry(host, eventId, target, { ...input, value: 1.55, verticalState: 'pass' }, transaction);
      for (let n = 0; n < 3; n++) await createSessionEntry(host, eventId, target, { ...input, value: 1.6, verticalState: 'failure' }, transaction);
      await expect(createSessionEntry(host, eventId, target, { ...input, value: 1.65, verticalState: 'clearance' }, transaction)).rejects.toMatchObject({ code: 'INVALID_VERTICAL_SEQUENCE' });
    }
    expect((await sessionStatistics(host, eventId, s.id, undefined, pool)).best).toBeNull();
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: opened.version }, transaction);
    const results = await listSessionResults(host, eventId, s.id, pool);
    expect(entrants.map(en => results.find(r => r.entrantId === en.id)?.placing)).toEqual([1, 1, 3]);
    expect(results.every(r => r.finalResult === 1.5 && !r.countsTowardsStatistics)).toBe(true);
    const audit = await pool.query("SELECT * FROM meet_domain_audit WHERE event_id = $1 AND entity_type = 'entry'", [eventId]);
    expect(audit.rows.length).toBe(16);
  });
  function action(target: SessionTarget, overrides: Partial<SessionSyncAction> = {}): SessionSyncAction {
    return { actionId: randomUUID(), actionType: 'create_entry', target, payload: { ...timed }, clientTimestamp: new Date().toISOString(), ...overrides };
  }

  it('upgrades populated 0027 without rewriting history, is repeatable, and retains the 100m service contract', async () => {
    await pool.query("UPDATE events SET status = 'in_progress' WHERE id = $1", [eventId]);
    await pool.query("INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id, rsvp_status) VALUES ($1,$2,$3,'yes')", [eventId, athleteId, host.workspaceId]);
    // The pre-upgrade app wrote entries without recorded_workspace_id; the service
    // INSERT now requires it, so simulate the legacy writer directly.
    const legacyRow = await pool.query(
      `INSERT INTO timeline_entries (event_id, athlete_id, discipline, entry_type, value, unit, is_foul, recorded_by, device_id)
       VALUES ($1,$2,'100m',$3,$4,'seconds',false,$5,$6) RETURNING *`,
      [eventId, athleteId, timed.entryType, timed.value, host.userId, timed.deviceId],
    );
    await recomputeEventResults(pool, eventId, 'competition');
    const legacy = mapTimelineEntryRow(legacyRow.rows[0] as TimelineEntryRow);
    await pool.query("UPDATE results SET manual_override = 11.1, override_reason = 'Photo finish', overridden_by = $1, override_at = now() WHERE event_id = $2", [host.userId, eventId]);
    const before = await pool.query(`SELECT to_jsonb(e) AS event, (SELECT jsonb_agg(to_jsonb(t) - 'recorded_workspace_id') FROM timeline_entries t) AS timeline, (SELECT jsonb_agg(r) FROM results r) AS results FROM events e WHERE id = $1`, [eventId]);
    await migrate();
    await migrate();
    const after = await pool.query(`SELECT to_jsonb(e) AS event, (SELECT jsonb_agg(to_jsonb(t) - 'recorded_workspace_id') FROM timeline_entries t) AS timeline, (SELECT jsonb_agg(r) FROM results r) AS results FROM events e WHERE id = $1`, [eventId]);
    expect(after.rows).toEqual(before.rows);
    expect((await pool.query('SELECT recorded_workspace_id FROM timeline_entries')).rows).toEqual([{ recorded_workspace_id: host.workspaceId }]);
    expect(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count)).toBe(migrations.length);
    expect(await listTimelineEntries(host.workspaceId, eventId, pool)).toEqual([{ ...legacy, recorderName: 'Host', recorderClub: 'Host', canEdit: true, canUndo: true }]);
    const stats = await getAthleteStatisticsDetail(host.workspaceId, athleteId, '2026-09-01', transaction);
    expect(stats.pb).toBe(11.1);
    expect((await pool.query('SELECT * FROM discipline_sessions')).rows).toEqual([]);
    await removeTimelineEntry(host.workspaceId, eventId, legacy.id, { expectedVersion: 1 }, transaction);
    expect((await pool.query('SELECT outcome, manual_override FROM results')).rows[0]).toMatchObject({ outcome: 'no_result', manual_override: '11.1' });
  });

  it('rolls back a failed migration transaction and enforces immutable versioned catalogue data', async () => {
    await expect(transaction(async (db) => {
      await applyMigrations(db, migrations);
      await db.query('SELECT missing_issue_244_column');
    })).rejects.toThrow();
    expect((await pool.query("SELECT to_regclass('discipline_sessions') AS name")).rows[0].name).toBeNull();
    await migrate();
    const original = await definition();
    expect(original).toMatchObject({ version: 1, kind: 'track', unit: 'seconds', direction: 'lower', precision: 2, defaultRules: { aggregation: 'timed' } });
    await expect(pool.query('UPDATE discipline_definitions SET precision = 3 WHERE id = $1', [original.id])).rejects.toThrow('immutable');
    await expect(transaction((db) => applyMigrations(db, migrations.map((m) => m.name.startsWith('0028_') ? { ...m, checksum: 'modified' } : m)))).rejects.toThrow('has been modified');
    const first = await session();
    await pool.query("INSERT INTO discipline_definitions (code, version, kind, unit, direction, default_rules, precision, presentation, source) SELECT code, 2, kind, unit, direction, default_rules, 3, presentation, 'test-version' FROM discipline_definitions WHERE id = $1", [original.id]);
    expect((await listSessions(host, eventId, pool))[0].disciplineDefinitionId).toBe(first.disciplineDefinitionId);
    expect((await listDisciplines(pool)).filter((row) => row.code === '100m')).toHaveLength(2);
  });

  it('installs the complete schema on an empty database with UUID keys and catalogue seeds', async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate();
    expect((await listDisciplines(pool)).map((row) => row.code)).toEqual(['100m', '100mh', '1500m', '200m', '400m', '400mh', '4x100m', '800m', 'discus', 'high_jump', 'javelin', 'long_jump', 'shot_put', 'triple_jump']);
    const columns = await pool.query("SELECT table_name, data_type FROM information_schema.columns WHERE column_name = 'id' AND table_name IN ('discipline_definitions','discipline_sessions','meet_entrants','relay_members','session_entrants','session_timeline_entries','session_results','meet_domain_audit')");
    expect(columns.rows).toHaveLength(8);
    expect(columns.rows.every((row) => row.data_type === 'uuid')).toBe(true);
  });

  it('owns multiple repeated-discipline sessions with independent state and optimistic versions', async () => {
    await migrate();
    const first = await session('100m', 'Heat 1');
    const second = await session('100m', 'Heat 2');
    const field = await session('long_jump');
    await open(first.id);
    expect((await listSessions(host, eventId, pool)).map((row) => row.status)).toEqual(['in_progress', 'scheduled', 'scheduled']);
    await expect(changeSessionState(host, eventId, first.id, { status: 'completed', expectedVersion: 1 }, transaction)).rejects.toMatchObject({ code: 'SESSION_VERSION_CONFLICT' });
    await changeSessionState(host, eventId, first.id, { status: 'completed', expectedVersion: 2 }, transaction);
    expect((await listSessions(host, eventId, pool)).find((row) => row.id === second.id)?.status).toBe('scheduled');
    expect(new Set([first.id, second.id, field.id]).size).toBe(3);
  });

  it('supports athlete, guest and ordered relay entrants while rejecting foreign athletes/members and nested relays', async () => {
    await migrate();
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const guests = await Promise.all(['A', 'B', 'C'].map((name) => guest(name)));
    const detailedGuest = await createEntrant(host, eventId, { kind: 'guest', name: 'D', clubName: 'Visitors', details: 'Lane 4' }, transaction);
    const members = [athlete.id, ...guests.map((row) => row.id)];
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: 'Team', memberIds: members }, transaction);
    expect(relay).toMatchObject({ kind: 'relay', athleteId: null, memberIds: members });
    expect(athlete).toMatchObject({ kind: 'athlete', athleteId, name: 'Host athlete' });
    expect(guests[0]).toMatchObject({ kind: 'guest', athleteId: null });
    expect(detailedGuest).toMatchObject({ kind: 'guest', clubName: 'Visitors', details: 'Lane 4' });
    expect((await listEntrants(host, eventId, pool)).find((entrant) => entrant.id === detailedGuest.id)).toMatchObject({ clubName: 'Visitors', details: 'Lane 4' });
    await expect(createEntrant(host, eventId, { kind: 'athlete', athleteId: otherAthleteId }, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(createEntrant(host, eventId, { kind: 'relay', name: 'Invalid', memberIds: [relay.id, athlete.id] }, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(pool.query("INSERT INTO meet_entrants (event_id,workspace_id,kind,athlete_id,name,created_by) VALUES ($1,$2,'athlete',$3,'Leak',$4)", [eventId, host.workspaceId, otherAthleteId, host.userId])).rejects.toMatchObject({ code: '23503' });
    const relaySession = await session('4x100m');
    await registerEntrant(host, eventId, { disciplineSessionId: relaySession.id, entrantId: relay.id }, transaction);
    await expect(registerEntrant(host, eventId, { disciplineSessionId: relaySession.id, entrantId: athlete.id }, transaction)).rejects.toMatchObject({ code: 'ENTRANT_KIND_MISMATCH' });
    expect((await pool.query("SELECT * FROM meet_domain_audit WHERE entity_type = 'relay_member'")).rows).toHaveLength(4);
  });

  it('requires athletes to select the discipline before registering for its session', async () => {
    await migrate();
    const javelin = await definition('javelin');
    const javelinSession = await createSession(host, eventId, { disciplineDefinitionId: javelin.id, label: 'Javelin throw' }, transaction);
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    await pool.query('DELETE FROM athlete_preferred_disciplines WHERE athlete_id = $1', [athleteId]);

    await expect(registerEntrant(host, eventId, { disciplineSessionId: javelinSession.id, entrantId: athlete.id }, transaction)).rejects.toMatchObject({
      code: 'ATHLETE_DISCIPLINE_MISMATCH',
    });

    await pool.query('INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id) VALUES ($1,$2)', [athleteId, javelin.id]);
    await expect(registerEntrant(host, eventId, { disciplineSessionId: javelinSession.id, entrantId: athlete.id }, transaction)).resolves.toMatchObject({
      entrantId: athlete.id,
    });
  });

  it('rejects wrong parents, unregistered/cross-workspace targets and missing required result identity in the database', async () => {
    const target = await ready();
    await expect(listSessions(other, eventId, pool)).rejects.toMatchObject({ status: 404 });
    await expect(createSessionEntry(other, eventId, target, timed, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(createSessionEntry(host, randomUUID(), target, timed, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(createSessionEntry(host, eventId, { ...target, entrantId: randomUUID() }, timed, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(pool.query("INSERT INTO session_results(event_id,session_id,entrant_id,workspace_id,outcome,unit) VALUES ($1,$2,$3,$4,'no_result','seconds')", [eventId, target.disciplineSessionId, target.entrantId, other.workspaceId])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query("INSERT INTO session_results(event_id,entrant_id,workspace_id,outcome,unit) VALUES ($1,$2,$3,'no_result','seconds')", [eventId, target.entrantId, host.workspaceId])).rejects.toMatchObject({ code: '23502' });
    await expect(pool.query("INSERT INTO session_timeline_entries(event_id,session_id,entrant_id,workspace_id,entry_type,value,unit,recorded_by) VALUES ($1,$2,$3,$4,'attempt',12,'seconds',$5)", [eventId, target.disciplineSessionId, randomUUID(), host.workspaceId, host.userId])).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps repeated-session results separate, supports corrections/undo/override, and audits each mutation', async () => {
    await migrate();
    const first = await session();
    const second = await session();
    const entrant = await guest();
    const a = { disciplineSessionId: first.id, entrantId: entrant.id };
    const b = { disciplineSessionId: second.id, entrantId: entrant.id };
    await registerEntrant(host, eventId, a, transaction);
    await registerEntrant(host, eventId, b, transaction);
    await open(first.id);
    await open(second.id);
    const entry = await createSessionEntry(host, eventId, a, timed, transaction);
    const otherEntry = await createSessionEntry(host, eventId, b, { ...timed, value: 12 }, transaction);
    await expect(selectSessionResultEntry(host, eventId, a, { entryId: otherEntry.id, expectedVersion: 1 }, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(selectSessionResultEntry(other, eventId, a, { entryId: entry.id, expectedVersion: 1 }, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(mutateSessionEntry(host, eventId, b, entry.id, { ...timed, expectedVersion: 1 }, false, transaction)).rejects.toMatchObject({ status: 404 });
    const corrected = await mutateSessionEntry(host, eventId, a, entry.id, { ...timed, value: 11, expectedVersion: 1 }, false, transaction);
    expect(corrected.version).toBe(2);
    await expect(mutateSessionEntry(host, eventId, a, entry.id, { ...timed, expectedVersion: 1 }, false, transaction)).rejects.toMatchObject({ code: 'TIMELINE_ENTRY_VERSION_CONFLICT' });
    await selectSessionResultEntry(host, eventId, a, { entryId: entry.id, expectedVersion: 2 }, transaction);
    await selectSessionResultEntry(host, eventId, b, { entryId: otherEntry.id, expectedVersion: 1 }, transaction);
    expect((await listSessionResults(host, eventId, first.id, pool))[0]).toMatchObject({ ...a, finalResult: 11 });
    expect((await listSessionResults(host, eventId, second.id, pool))[0]).toMatchObject({ ...b, finalResult: 12 });
    await expect(overrideSessionResult(host, eventId, a, { manualOverride: 10.9, overrideReason: 'Photo', expectedVersion: 3 }, transaction)).rejects.toMatchObject({ code: 'DERIVED_RESULT_ONLY' });
    expect((await sessionStatistics(host, eventId, first.id, entrant.id, pool)).best).toBeNull();
    await mutateSessionEntry(host, eventId, a, entry.id, { expectedVersion: 2 }, true, transaction);
    expect((await listSessionResults(host, eventId, first.id, pool))[0]).toMatchObject({ outcome: 'no_result', effectiveResult: null, effectiveOutcome: 'no_result' });
    const audit = await pool.query('SELECT * FROM meet_domain_audit WHERE entity_id = $1 ORDER BY created_at', [entry.id]);
    expect(audit.rows.map((row) => row.action)).toEqual(['created', 'corrected', 'undone']);
    expect(audit.rows.every((row) => row.actor_id === host.userId && row.public_logger_session_id === null)).toBe(true);
    expect((await pool.query('SELECT * FROM results')).rows).toEqual([]);
    expect((await pool.query('SELECT * FROM timeline_entries')).rows).toEqual([]);
  });

  it('supports coach-selected official relay splits, roster edits, and keeps individual stats isolated', async () => {
    await migrate();
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const guests = await Promise.all(['A', 'B', 'C'].map((name) => guest(name)));
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: 'Team', memberIds: [athlete.id, ...guests.map((g) => g.id)] }, transaction);
    const memberIds = (await pool.query<{ id: string }>('SELECT id FROM relay_members WHERE relay_id = $1 ORDER BY leg', [relay.id])).rows.map((row) => row.id);
    const session100 = await session('4x100m', '4x100 Final');
    const target = { disciplineSessionId: session100.id, entrantId: relay.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(session100.id);
    await expect(createSessionEntry(host, eventId, target, { ...timed, value: 62.1 }, transaction)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(createSessionEntry(host, eventId, target, { ...timed, value: null, incidentType: 'dq', relayMemberId: memberIds[0] }, transaction)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(createSessionEntry(host, eventId, target, { ...timed, value: 13, relayMemberId: randomUUID() }, transaction)).rejects.toMatchObject({ status: 404 });
    const splits = [13.42, 13.98, 14.11, 13.75];
    const entries = [];
    for (const [index, relayMemberId] of memberIds.entries()) {
      entries.push(await createSessionEntry(host, eventId, target, { ...timed, value: splits[index], relayMemberId }, transaction));
    }
    const resultVersion = async () => (await listSessionResults(host, eventId, session100.id, pool)).find((row) => row.entrantId === relay.id)!.version;
    const first = await selectSessionResultEntry(host, eventId, target, { entryId: entries[0].id, expectedVersion: await resultVersion(), relayMemberId: memberIds[0] }, transaction);
    expect(first).toMatchObject({ finalResult: null, selectedEntryId: null, effectiveResult: null, effectiveOutcome: 'no_result' });
    expect(first.relayLegs?.map((leg) => leg.value)).toEqual([13.42, null, null, null]);
    await expect(selectSessionResultEntry(host, eventId, target, { entryId: entries[1].id, expectedVersion: 99, relayMemberId: memberIds[1] }, transaction)).rejects.toMatchObject({ code: 'RESULT_VERSION_CONFLICT' });
    await expect(selectSessionResultEntry({ ...host, role: 'assistant' as const }, eventId, target, { entryId: entries[1].id, expectedVersion: await resultVersion(), relayMemberId: memberIds[1] }, transaction)).rejects.toMatchObject({ status: 403 });
    let selected = first;
    for (const [index, relayMemberId] of memberIds.slice(1).entries()) {
      selected = await selectSessionResultEntry(host, eventId, target, { entryId: entries[index + 1].id, expectedVersion: await resultVersion(), relayMemberId }, transaction);
    }
    expect(selected).toMatchObject({ finalResult: 55.26, effectiveResult: 55.26, placing: 1, selectedEntryId: null, effectiveOutcome: 'valid' });
    expect(selected.relayLegs?.map((leg) => leg.value)).toEqual(splits);
    expect((await pool.query('SELECT * FROM results')).rows).toEqual([]);
    const history = await getAthleteStatisticsDetail(host.workspaceId, athleteId, '2026-09-01', transaction);
    expect(history.pb).toBeNull();
    const { athleteRelayHistory } = await import('./relayHistory.js');
    expect(await athleteRelayHistory(host.workspaceId, athleteId, pool)).toEqual([]);
    await mutateSessionEntry(host, eventId, target, entries[1].id, { expectedVersion: 1, entryType: 'attempt', value: 13.9, unit: 'seconds', isFoul: false, incidentType: null, noteText: null, deviceId: 'test-device' }, false, transaction);
    const corrected = (await listSessionResults(host, eventId, session100.id, pool)).find((row) => row.entrantId === relay.id)!;
    expect(corrected.relayLegs?.map((leg) => leg.value)).toEqual([13.42, null, 14.11, 13.75]);
    expect(corrected.effectiveResult).toBeNull();
    await selectSessionResultEntry(host, eventId, target, { entryId: entries[1].id, expectedVersion: await resultVersion(), relayMemberId: memberIds[1] }, transaction);
    await changeSessionState(host, eventId, session100.id, { status: 'completed', expectedVersion: 2 }, transaction);
    await setEventStatus('completed');
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026)).toMatchObject([{ discipline: '4x100m', pb: 13.42, sb: 13.42, resultCount: 1, seasonCount: 1 }]);
    await expect(updateEntrant(host, eventId, relay.id, { memberIds: [guests[0].id, athlete.id, guests[1].id, guests[2].id] }, transaction)).rejects.toMatchObject({ code: 'ROSTER_LOCKED' });
    await pool.query("UPDATE events SET status = 'scheduled' WHERE id = $1", [eventId]);
    await pool.query('DELETE FROM session_relay_selections');
    await pool.query('DELETE FROM session_results');
    await pool.query('DELETE FROM session_timeline_entries');
    const updated = await updateEntrant(host, eventId, relay.id, { name: 'Renamed', memberIds: [guests[0].id, athlete.id, guests[1].id, guests[2].id] }, transaction);
    expect(updated).toMatchObject({ name: 'Renamed', memberIds: [guests[0].id, athlete.id, guests[1].id, guests[2].id] });
    const relayHistory = await athleteRelayHistory(host.workspaceId, athleteId, pool);
    expect(relayHistory.some((row) => row.teamName === 'Renamed' && row.countsAsIndividualResult === false)).toBe(true);
  });

  it('finalizes a relay only once every split is official and exposes the summed team result', async () => {
    await migrate();
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const guests = await Promise.all(['A', 'B', 'C'].map((name) => guest(name)));
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: 'Speed Demons', memberIds: [athlete.id, ...guests.map((g) => g.id)] }, transaction);
    const memberIds = (await pool.query<{ id: string }>('SELECT id FROM relay_members WHERE relay_id = $1 ORDER BY leg', [relay.id])).rows.map((row) => row.id);
    const s = await session('4x100m', '4x100 Final');
    const target = { disciplineSessionId: s.id, entrantId: relay.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    const splits = [13.42, 13.98, 14.11, 13.75];
    const entries = [];
    for (const [index, relayMemberId] of memberIds.entries()) {
      entries.push(await createSessionEntry(host, eventId, target, { ...timed, value: splits[index], relayMemberId }, transaction));
    }
    const resultVersion = async () => (await listSessionResults(host, eventId, s.id, pool)).find((row) => row.entrantId === relay.id)!.version;
    for (const [index, relayMemberId] of memberIds.slice(0, 3).entries()) {
      await selectSessionResultEntry(host, eventId, target, { entryId: entries[index].id, expectedVersion: await resultVersion(), relayMemberId }, transaction);
    }
    await expect(changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction)).rejects.toMatchObject({ code: 'RELAY_RESULTS_INCOMPLETE' });
    await selectSessionResultEntry(host, eventId, target, { entryId: entries[3].id, expectedVersion: await resultVersion(), relayMemberId: memberIds[3] }, transaction);
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
    const finalized = (await listSessionResults(host, eventId, s.id, pool)).find((row) => row.entrantId === relay.id)!;
    expect(finalized).toMatchObject({ finalResult: 55.26, outcome: 'valid', placing: 1, selectedEntryId: null });
    expect(finalized.relayLegs?.map((leg) => [leg.leg, leg.value])).toEqual([[1, 13.42], [2, 13.98], [3, 14.11], [4, 13.75]]);
    await pool.query("UPDATE events SET status = 'completed' WHERE id = $1", [eventId]);
    const finals = await listEventFinalResults(host, eventId, pool);
    expect(finals.find((row) => row.entrantId === relay.id)).toMatchObject({ finalResult: 55.26, placing: 1, relayMembers: ['Host athlete', 'A', 'B', 'C'] });
    expect(finals.find((row) => row.entrantId === relay.id)?.relayLegs?.map((leg) => leg.value)).toEqual(splits);
    const club = await pool.query("INSERT INTO clubs (workspace_id, name, public_results_enabled) VALUES ($1,'Published',true) RETURNING id", [host.workspaceId]);
    const published = (await publicClubSessionResults(club.rows[0].id, pool)).find((meet) => meet.eventId === eventId);
    const publicRelay = published?.sessions.find((row) => row.id === s.id)?.results.find((row) => row.entrantId === relay.id);
    expect(publicRelay).toMatchObject({ value: 55.26, outcome: 'valid', placing: 1 });
    expect(publicRelay?.relayLegs?.map((leg) => leg.value)).toEqual(splits);
  });

  it('finalizes a relay team incident without any split selections', async () => {
    await migrate();
    const athleteEntrant = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: 'DNF Team', memberIds: [athleteEntrant.id, ...(await Promise.all(['A', 'B', 'C'].map((name) => guest(name)))).map((g) => g.id)] }, transaction);
    const s = await session('4x100m', '4x100 DQ');
    const target = { disciplineSessionId: s.id, entrantId: relay.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    await createSessionEntry(host, eventId, target, { ...timed, value: null, unit: null, incidentType: 'dq' }, transaction);
    const result = (await listSessionResults(host, eventId, s.id, pool)).find((row) => row.entrantId === relay.id)!;
    expect(result).toMatchObject({ effectiveOutcome: 'dq', effectiveResult: null });
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
    expect((await listSessionResults(host, eventId, s.id, pool)).find((row) => row.entrantId === relay.id)).toMatchObject({ outcome: 'dq', finalResult: null });
  });

  it('marks official relay leg splits as personal bests, keeps DQ legs valid, and never flags the team total', async () => {
    await migrate();
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const guests = await Promise.all(['A', 'B', 'C'].map((name) => guest(name)));
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: 'Speed Demons', memberIds: [athlete.id, ...guests.map((g) => g.id)] }, transaction);
    const memberIds = (await pool.query<{ id: string }>('SELECT id FROM relay_members WHERE relay_id = $1 ORDER BY leg', [relay.id])).rows.map((row) => row.id);
    const runFinal = async (label: string, athleteSplit: number, teamIncident = false) => {
      await setEventStatus('in_progress');
      const s = await session('4x100m', label);
      const target = { disciplineSessionId: s.id, entrantId: relay.id };
      await registerEntrant(host, eventId, target, transaction);
      await open(s.id);
      const splits = [athleteSplit, 13.98, 14.11, 13.75];
      const entries = [];
      for (const [index, relayMemberId] of memberIds.entries()) {
        entries.push(await createSessionEntry(host, eventId, target, { ...timed, value: splits[index], relayMemberId }, transaction));
      }
      if (teamIncident) await createSessionEntry(host, eventId, target, { ...timed, value: null, unit: null, incidentType: 'dq' }, transaction);
      const resultVersion = async () => (await listSessionResults(host, eventId, s.id, pool)).find((row) => row.entrantId === relay.id)!.version;
      for (const [index, relayMemberId] of memberIds.entries()) {
        await selectSessionResultEntry(host, eventId, target, { entryId: entries[index].id, expectedVersion: await resultVersion(), relayMemberId }, transaction);
      }
      await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
      await setEventStatus('completed');
      return (await listSessionResults(host, eventId, s.id, pool)).find((row) => row.entrantId === relay.id)!;
    };

    const first = await runFinal('4x100 Heats', 12.9);
    expect(first.countsTowardsStatistics).toBe(false);
    expect(first.isPb).toBe(false);
    expect(first.relayLegs?.map((leg) => [leg.value, leg.isPb, leg.isSb])).toEqual([[12.9, true, true], [13.98, false, false], [14.11, false, false], [13.75, false, false]]);
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026)).toMatchObject([{ discipline: '4x100m', pb: 12.9, sb: 12.9, resultCount: 1 }]);

    const dqFinal = await runFinal('4x100 Final', 13.2, true);
    expect(dqFinal.effectiveOutcome).toBe('dq');
    expect(dqFinal.isPb).toBe(false);
    expect(dqFinal.relayLegs?.[0]).toMatchObject({ value: 13.2, isPb: false, isSb: false });
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026)).toMatchObject([{ discipline: '4x100m', pb: 12.9, resultCount: 2 }]);

    const faster = await runFinal('4x100 Repeat', 12.5);
    expect(faster.relayLegs?.map((leg) => leg.isPb)).toEqual([true, false, false, false]);
    expect(faster.isPb).toBe(false);
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026)).toMatchObject([{ discipline: '4x100m', pb: 12.5, sb: 12.5, resultCount: 3 }]);
  });

  async function finalRelayLeg(splits: number[], label: string) {
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const guests = await Promise.all(['A', 'B', 'C'].map((name) => guest(name)));
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: 'Speed Demons', memberIds: [athlete.id, ...guests.map((g) => g.id)] }, transaction);
    const memberIds = (await pool.query<{ id: string }>('SELECT id FROM relay_members WHERE relay_id = $1 ORDER BY leg', [relay.id])).rows.map((row) => row.id);
    const s = await session('4x100m', label);
    const target = { disciplineSessionId: s.id, entrantId: relay.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    const entries = [];
    for (const [index, relayMemberId] of memberIds.entries()) {
      entries.push(await createSessionEntry(host, eventId, target, { ...timed, value: splits[index], relayMemberId }, transaction));
    }
    const resultVersion = async () => (await listSessionResults(host, eventId, s.id, pool)).find((row) => row.entrantId === relay.id)!.version;
    for (const [index, relayMemberId] of memberIds.entries()) {
      await selectSessionResultEntry(host, eventId, target, { entryId: entries[index].id, expectedVersion: await resultVersion(), relayMemberId }, transaction);
    }
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
  }

  async function secondHostAthlete() {
    const secondAthleteId = (await pool.query<{ id: string }>(
      'INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1,$2,$3) RETURNING id',
      [host.workspaceId, host.userId, 'Second athlete'],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id)
       SELECT $1, definition.id FROM discipline_definitions definition WHERE definition.code = '100m'`,
      [secondAthleteId],
    );
    return secondAthleteId;
  }

  it('surfaces relay leg personal bests and team results on the roster, progression, comparison, and public statistics', async () => {
    await migrate();
    const allSeasons = { selected: 'all' as const, startDate: null, endDate: null };
    await finalRelayLeg([12.5, 13.98, 14.11, 13.75], '4x100 Final');
    await setEventStatus('completed');

    const { getDashboardSummary } = await import('./dashboard.js');
    const dashboard = await getDashboardSummary(host.workspaceId, '2026-09-01', transaction, allSeasons);
    const rosterEntry = dashboard.rosterSnapshot.find((row) => row.athleteId === athleteId)!;
    expect(rosterEntry.disciplines).toEqual(expect.arrayContaining([expect.objectContaining({ discipline: '4x100m', pb: 12.5 })]));

    const { getDisciplineProgression } = await import('./disciplineProgression.js');
    expect(await getDisciplineProgression(pool, host.workspaceId, athleteId, (await definition('4x100m')).id, allSeasons)).toMatchObject({
      summary: { personalBest: 12.5, resultCount: 1 },
      entries: [{ eventDate: new Date('2026-09-01T00:00:00'), value: 12.5, isNewPb: true }],
    });

    const secondAthleteId = await secondHostAthlete();
    const { getMultiAthleteComparison } = await import('./comparison.js');
    const comparison = await getMultiAthleteComparison(host.workspaceId, [athleteId, secondAthleteId], transaction, allSeasons);
    expect(comparison.athletes[0].disciplines.find((discipline) => discipline.discipline === '4x100m')).toMatchObject({
      pb: 12.5, validResultCount: 1, progression: [{ date: '2026-09-01', result: 12.5 }],
    });

    await pool.query("INSERT INTO clubs (workspace_id, name, public_results_enabled) VALUES ($1,'Published',true)", [host.workspaceId]);
    const { getClubStatistics } = await import('./clubs.js');
    const hostClubId = (await pool.query<{ id: string }>('SELECT id FROM clubs WHERE workspace_id = $1', [host.workspaceId])).rows[0].id;
    expect((await getClubStatistics(hostClubId, pool, allSeasons)).disciplines?.find((discipline) => discipline.discipline === '4x100m')).toMatchObject({
      validResultCount: 1, fastestValidResult: 54.34, distinctAthletesWithValidResults: 1,
    });

    const { getPublicAthleteStatistics } = await import('./publicStatistics.js');
    const publicAthletes = await getPublicAthleteStatistics(host.workspaceId, hostClubId, pool, allSeasons);
    expect(publicAthletes.find((entry) => entry.athlete.id === athleteId)?.disciplines.find((discipline) => discipline.discipline === '4x100m')).toMatchObject({
      pb: 12.5, validResultCount: 1, progression: [{ date: '2026-09-01', result: 12.5 }],
    });

    const { getPublicStatisticsReport } = await import('./publicStatisticsReport.js');
    expect(await getPublicStatisticsReport({ discipline: '4x100m', season: '2026' }, pool)).toEqual([
      expect.objectContaining({ athleteName: 'Speed Demons', clubName: 'Published', discipline: '4x100m', performance: 54.34, place: 1 }),
    ]);
    expect(await getPublicStatisticsReport({ discipline: '4x100m', season: '2026', gender: 'male' }, pool)).toEqual([]);

    await pool.query("UPDATE events SET status = 'completed' WHERE id = $1", [eventId]);
    const { getPublicLeaderboard } = await import('./leaderboard.js');
    expect(await getPublicLeaderboard({ discipline: '4x100m', season: '2026' }, pool)).toEqual([
      expect.objectContaining({ athleteName: 'Speed Demons', clubName: 'Published', performance: 54.34, place: 1 }),
    ]);
    expect(await getPublicLeaderboard({ discipline: '4x100m', season: '2026', age: '20' }, pool)).toEqual([]);
  });

  it('hides removed disciplines from roster and comparison surfaces while preferences remain in storage', async () => {
    await migrate();
    const allSeasons = { selected: 'all' as const, startDate: null, endDate: null };
    // migrate() seeds preferences after migration 0044 runs, mimicking a workspace
    // that still carries rows written before the prune shipped.
    const stalePreferences = await pool.query<{ code: string }>(
      `SELECT definitions.code FROM athlete_preferred_disciplines preferences
       JOIN discipline_definitions definitions ON definitions.id = preferences.discipline_definition_id
       WHERE preferences.athlete_id = $1 AND definitions.code IN ('hammer', '4x400m')`,
      [athleteId],
    );
    expect(stalePreferences.rows.map((row) => row.code).sort()).toEqual(['4x400m', 'hammer']);

    const { getDashboardSummary } = await import('./dashboard.js');
    const dashboard = await getDashboardSummary(host.workspaceId, '2026-09-01', transaction, allSeasons);
    const rosterDisciplines = dashboard.rosterSnapshot.find((row) => row.athleteId === athleteId)!.disciplines.map((row) => row.discipline);
    expect(rosterDisciplines).toContain('100m');
    expect(rosterDisciplines).not.toContain('hammer');
    expect(rosterDisciplines).not.toContain('4x400m');

    const secondAthleteId = await secondHostAthlete();
    const { getMultiAthleteComparison } = await import('./comparison.js');
    const comparison = await getMultiAthleteComparison(host.workspaceId, [athleteId, secondAthleteId], transaction, allSeasons);
    const comparedDisciplines = comparison.athletes[0].disciplines.map((discipline) => discipline.discipline);
    expect(comparedDisciplines).not.toContain('hammer');
    expect(comparedDisciplines).not.toContain('4x400m');

    await pool.query("INSERT INTO clubs (workspace_id, name, public_results_enabled) VALUES ($1,'Published',true)", [host.workspaceId]);
    const { getClubStatistics } = await import('./clubs.js');
    const hostClubId = (await pool.query<{ id: string }>('SELECT id FROM clubs WHERE workspace_id = $1', [host.workspaceId])).rows[0].id;
    const clubStatistics = await getClubStatistics(hostClubId, pool, allSeasons);
    expect(clubStatistics.disciplines?.map((discipline) => discipline.discipline)).not.toContain('hammer');
    expect(clubStatistics.availableDisciplines?.map((discipline) => discipline.discipline)).not.toContain('hammer');
  });

  it('prunes unsupported discipline preferences while retaining the catalogue rows', async () => {
    await transaction((db) => applyMigrations(db, migrations.filter(m => m.name < '0044_')));
    await pool.query(
      `INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id)
       SELECT $1, definition.id FROM discipline_definitions definition WHERE definition.code IN ('hammer', '4x400m', '100m')`,
      [athleteId],
    );
    await transaction((db) => applyMigrations(db, migrations.filter(m => m.name >= '0044_')));

    const remaining = await pool.query<{ code: string }>(
      `SELECT definitions.code FROM athlete_preferred_disciplines preferences
       JOIN discipline_definitions definitions ON definitions.id = preferences.discipline_definition_id
       WHERE preferences.athlete_id = $1`,
      [athleteId],
    );
    expect(remaining.rows.map((row) => row.code)).toEqual(['100m']);
    expect((await pool.query("SELECT 1 FROM discipline_definitions WHERE code IN ('hammer', '4x400m')")).rows).toHaveLength(2);
  });

  it('uses measured direction, ignores fouls, and excludes cancelled/withdrawn registrations from statistics', async () => {
    await migrate();
    const s = await session('long_jump');
    const entrant = await guest();
    const target = { disciplineSessionId: s.id, entrantId: entrant.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    await expect(createSessionEntry(host, eventId, target, timed, transaction)).rejects.toMatchObject({ status: 400 });
    await createSessionEntry(host, eventId, target, { ...timed, unit: 'metres', value: 5.9 }, transaction);
    const best = await createSessionEntry(host, eventId, target, { ...timed, unit: 'metres', value: 6.2 }, transaction);
    const foul = await createSessionEntry(host, eventId, target, { ...timed, unit: 'metres', value: 7, isFoul: true }, transaction);
    expect((await listSessionResults(host, eventId, s.id, pool))[0]).toMatchObject({ effectiveResult: null, placing: null, countsTowardsStatistics: false });
    await expect(selectSessionResultEntry(host, eventId, target, { entryId: foul.id, expectedVersion: 3 }, transaction)).rejects.toMatchObject({ status: 404 });
    const selected = await selectSessionResultEntry(host, eventId, target, { entryId: best.id, expectedVersion: 3 }, transaction);
    expect(selected).toMatchObject({ effectiveResult: 6.2, placing: 1, countsTowardsStatistics: false });
    await withdrawEntrant(host, eventId, target, transaction);
    expect(await sessionStatistics(host, eventId, s.id, undefined, pool)).toMatchObject({ best: null, validResultCount: 0, resultCount: 1 });
    await expect(createSessionEntry(host, eventId, target, { ...timed, unit: 'metres' }, transaction)).rejects.toMatchObject({ code: 'ENTRANT_WITHDRAWN' });
  });

  it('restores a withdrawn registration while the session roster is open', async () => {
    await migrate();
    const s = await session('javelin');
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const target = { disciplineSessionId: s.id, entrantId: athlete.id };
    const registered = await registerEntrant(host, eventId, target, transaction);

    await withdrawEntrant(host, eventId, target, transaction);
    const restored = await registerEntrant(host, eventId, target, transaction);

    expect(restored).toMatchObject({ id: registered.id, withdrawnAt: null, withdrawnBy: null });
    expect((await pool.query('SELECT withdrawn_at, withdrawn_by FROM session_entrants WHERE id = $1', [registered.id])).rows[0]).toEqual({ withdrawn_at: null, withdrawn_by: null });
    expect((await pool.query("SELECT action FROM meet_domain_audit WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1", [registered.id])).rows[0]).toEqual({ action: 'restored' });
  });

  it('gives fixture guests the full start list and rejects stale fixture acceptance', async () => {
    await migrate();
    await pool.query("INSERT INTO event_fixture_workspaces (event_id,workspace_id,role,status,contact_email,joined_by) VALUES ($1,$2,'guest','accepted','guest@test.example',$3)", [eventId, other.workspaceId, other.userId]);
    const s = await session();
    const own = await guest();
    const visiting = await createEntrant(other, eventId, { kind: 'athlete', athleteId: otherAthleteId }, transaction);
    await expect(createSession(other, eventId, { disciplineDefinitionId: (await definition()).id, label: 'Not host' }, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(registerEntrant(other, eventId, { disciplineSessionId: s.id, entrantId: own.id }, transaction)).rejects.toMatchObject({ status: 404 });
    const target = { disciplineSessionId: s.id, entrantId: visiting.id };
    await registerEntrant(other, eventId, target, transaction);
    expect((await listEntrants(other, eventId, pool)).map((row) => row.id)).toEqual([own.id, visiting.id]);
    await open(s.id);
    await createSessionEntry(other, eventId, target, timed, transaction);
    expect(await listSessionResults(other, eventId, s.id, pool)).toHaveLength(1);
    await pool.query('UPDATE events SET fixture_revision = fixture_revision + 1 WHERE id = $1', [eventId]);
    await expect(listSessionResults(other, eventId, s.id, pool)).rejects.toMatchObject({ status: 404 });
  });

  it('enforces coach corrections and parent/session logging state without deleting history', async () => {
    const target = await ready();
    const assistant = { ...host, role: 'assistant' as const };
    const entry = await createSessionEntry(assistant, eventId, target, timed, transaction);
    await expect(mutateSessionEntry(assistant, eventId, target, entry.id, { expectedVersion: 1 }, true, transaction)).rejects.toMatchObject({ status: 403 });
    await selectSessionResultEntry(host, eventId, target, { entryId: entry.id, expectedVersion: 1 }, transaction);
    await changeSessionState(host, eventId, target.disciplineSessionId, { status: 'completed', expectedVersion: 2 }, transaction);
    await expect(createSessionEntry(host, eventId, target, timed, transaction)).rejects.toMatchObject({ code: 'SESSION_NOT_IN_PROGRESS' });
    await pool.query("UPDATE events SET status = 'cancelled' WHERE id = $1", [eventId]);
    expect((await listSessionResults(host, eventId, target.disciplineSessionId, pool))[0]).toMatchObject({ finalResult: 11.25, countsTowardsStatistics: false, placing: null });
  });

  it('retries concurrent session sync idempotently, binds receipts to targets, and keeps valid siblings after rejection', async () => {
    const target = await ready();
    const first = action(target);
    const batches = await Promise.all([processSessionSyncBatch(host, eventId, 'device', [first], transaction), processSessionSyncBatch(host, eventId, 'device', [first], transaction)]);
    expect(batches.flatMap((batch) => batch.receipts.map((receipt) => receipt.status)).sort()).toEqual(['accepted', 'duplicate']);
    const wrong = await processSessionSyncBatch(host, eventId, 'device', [{ ...first, target: { ...target, entrantId: randomUUID() } }], transaction);
    expect(wrong.receipts[0]).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    expect(wrong.receipts[0].entryId).toBeUndefined();
    const mixed = await processSessionSyncBatch(host, eventId, 'device', [action(target, { payload: { ...timed, value: -1 } }), action(target)], transaction);
    expect(mixed.receipts.map((receipt) => receipt.status)).toEqual(['rejected', 'accepted']);
    expect(await listSessionEntries(host, eventId, target.disciplineSessionId, undefined, pool)).toHaveLength(2);
    const stale = action(target, { actionType: 'edit_entry', payload: { ...timed, entryId: first.actionId }, expectedVersion: 99 });
    expect((await processSessionSyncBatch(host, eventId, 'device', [stale], transaction)).receipts[0]).toMatchObject({ code: 'TIMELINE_ENTRY_VERSION_CONFLICT' });
  });

  it('binds public sync to the event/session actor and audits last-write-wins conflicts', async () => {
    const target = await ready();
    const link = await pool.query("INSERT INTO public_logger_links (event_id,token_hash,created_by) VALUES ($1,'link',$2) RETURNING id", [eventId, host.userId]);
    const publicSessions = await pool.query("INSERT INTO public_logger_sessions(link_id,event_id,token_hash,logger_name,logger_club,expires_at) VALUES ($1,$2,'token-a','Official','Club',now()+interval '1 hour'),($1,$2,'token-b','Other official','Club',now()+interval '1 hour') RETURNING id", [link.rows[0].id, eventId]);
    const official = { publicLoggerSessionId: publicSessions.rows[0].id as string, publicLoggerLinkId: link.rows[0].id as string, publicLoggerName: 'Official', publicLoggerClub: 'Club' };
    const first = action(target);
    await processSessionSyncBatch(official, eventId, 'device', [first], transaction);
    const edit = action(target, { actionType: 'edit_entry', payload: { ...timed, value: 10.8, entryId: first.actionId }, expectedVersion: 99 });
    expect((await processSessionSyncBatch(official, eventId, 'device', [edit], transaction)).receipts[0].status).toBe('accepted');
    const conflicts = await pool.query('SELECT * FROM public_sync_conflict_log');
    expect(conflicts.rows[0]).toMatchObject({ discipline_session_id: target.disciplineSessionId, entrant_id: target.entrantId, overwritten_version: 1 });
    const denied = await processSessionSyncBatch({ publicLoggerSessionId: publicSessions.rows[1].id as string, publicLoggerLinkId: link.rows[0].id as string, publicLoggerName: 'Other official', publicLoggerClub: 'Club' }, eventId, 'device', [{ ...edit, actionId: randomUUID() }], transaction);
    expect(denied.receipts[0]).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    await pool.query("UPDATE public_logger_links SET status = 'revoked' WHERE id = $1", [link.rows[0].id]);
    await expect(processSessionSyncBatch(official, eventId, 'device', [action(target)], transaction)).rejects.toMatchObject({ status: 404 });
  });

  it('restricts session entry corrections to the recording club with a host override', async () => {
    const target = await ready();
    const joinFixture = async (actor: Extract<MeetActor, { userId: string }>, email: string) => {
      await pool.query("INSERT INTO event_fixture_workspaces (event_id,workspace_id,role,status,contact_email,joined_by) VALUES ($1,$2,'guest','accepted',$3,$4)", [eventId, actor.workspaceId, email, actor.userId]);
    };
    await joinFixture(other, 'other@test.example');
    const thirdUser = await pool.query<{ id: string }>("INSERT INTO users (auth0_id, name, email) VALUES ('auth|Third','Third','third@test.example') RETURNING id");
    const thirdWorkspace = await pool.query<{ id: string }>("INSERT INTO workspaces (name) VALUES ('Third') RETURNING id");
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'coach')", [thirdWorkspace.rows[0].id, thirdUser.rows[0].id]);
    const third: Extract<MeetActor, { userId: string }> = { userId: thirdUser.rows[0].id, workspaceId: thirdWorkspace.rows[0].id, role: 'coach' };
    await joinFixture(third, 'third@test.example');
    const sameClubUser = await pool.query<{ id: string }>("INSERT INTO users (auth0_id, name, email) VALUES ('auth|GuestTwo','Guest Two','guesttwo@test.example') RETURNING id");
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'coach')", [other.workspaceId, sameClubUser.rows[0].id]);
    const sameClub: Extract<MeetActor, { userId: string }> = { userId: sameClubUser.rows[0].id, workspaceId: other.workspaceId, role: 'coach' };

    const hostEntry = await createSessionEntry(host, eventId, target, timed, transaction);
    const guestEntry = await createSessionEntry(other, eventId, target, { ...timed, value: 10.9 }, transaction);

    await expect(mutateSessionEntry(other, eventId, target, hostEntry.id, { ...timed, value: 10, expectedVersion: 1 }, false, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(mutateSessionEntry(third, eventId, target, guestEntry.id, { ...timed, value: 10, expectedVersion: 1 }, false, transaction)).rejects.toMatchObject({ status: 404 });
    await mutateSessionEntry(sameClub, eventId, target, guestEntry.id, { ...timed, value: 10.9, expectedVersion: 1 }, false, transaction);
    await mutateSessionEntry(host, eventId, target, guestEntry.id, { ...timed, value: 10.8, expectedVersion: 2 }, false, transaction);
    await mutateSessionEntry(host, eventId, target, hostEntry.id, { ...timed, value: 11.2, expectedVersion: 1 }, false, transaction);

    expect(Object.fromEntries((await listSessionEntries(host, eventId, target.disciplineSessionId, undefined, pool)).map((entry) => [entry.id, [entry.canEdit, entry.canUndo]])))
      .toEqual({ [hostEntry.id]: [true, true], [guestEntry.id]: [true, true] });
    expect(Object.fromEntries((await listSessionEntries(other, eventId, target.disciplineSessionId, undefined, pool)).map((entry) => [entry.id, [entry.canEdit, entry.canUndo]])))
      .toEqual({ [hostEntry.id]: [false, false], [guestEntry.id]: [true, true] });
    expect(Object.fromEntries((await listSessionEntries(third, eventId, target.disciplineSessionId, undefined, pool)).map((entry) => [entry.id, [entry.canEdit, entry.canUndo]])))
      .toEqual({ [hostEntry.id]: [false, false], [guestEntry.id]: [false, false] });
    expect((await pool.query('SELECT recorded_workspace_id FROM session_timeline_entries WHERE id = $1', [hostEntry.id])).rows)
      .toEqual([{ recorded_workspace_id: host.workspaceId }]);
    expect((await pool.query('SELECT recorded_workspace_id FROM session_timeline_entries WHERE id = $1', [guestEntry.id])).rows)
      .toEqual([{ recorded_workspace_id: other.workspaceId }]);
  });

  it('keeps public logger corrections bound to the person across sessions', async () => {
    const target = await ready();
    const link = await pool.query<{ id: string }>("INSERT INTO public_logger_links (event_id,token_hash,created_by) VALUES ($1,'identity-link',$2) RETURNING id", [eventId, host.userId]);
    const openSession = async (token: string, loggerName: string, loggerClub: string) => {
      const session = await pool.query<{ id: string }>(
        "INSERT INTO public_logger_sessions(link_id,event_id,token_hash,logger_name,logger_club,expires_at) VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id",
        [link.rows[0].id, eventId, token, loggerName, loggerClub],
      );
      return { publicLoggerSessionId: session.rows[0].id, publicLoggerLinkId: link.rows[0].id, publicLoggerName: loggerName, publicLoggerClub: loggerClub };
    };
    const official = await openSession('official-token', ' Official ', 'Club');
    const entry = await createSessionEntry(official, eventId, target, timed, transaction);

    const samePersonNewSession = await openSession('official-return-token', 'official', 'CLUB');
    const corrected = await mutateSessionEntry(samePersonNewSession, eventId, target, entry.id, { ...timed, value: 10.9, expectedVersion: 1 }, false, transaction);
    expect(corrected.value).toBe(10.9);
    expect((await listSessionEntries(samePersonNewSession, eventId, target.disciplineSessionId, undefined, pool)).map((listEntry) => listEntry.canEdit)).toEqual([true]);

    const someoneElse = await openSession('stranger-token', 'Someone else', 'Club');
    await expect(mutateSessionEntry(someoneElse, eventId, target, entry.id, { ...timed, value: 10, expectedVersion: 2 }, false, transaction)).rejects.toMatchObject({ status: 404 });
    expect((await listSessionEntries(someoneElse, eventId, target.disciplineSessionId, undefined, pool)).map((listEntry) => [listEntry.canEdit, listEntry.canUndo])).toEqual([[false, false]]);

    const syncEdit = action(target, { actionType: 'edit_entry', payload: { ...timed, value: 10.7, entryId: entry.id }, expectedVersion: 99 });
    expect((await processSessionSyncBatch(someoneElse, eventId, 'device', [syncEdit], transaction)).receipts[0]).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    const ownSyncEdit = action(target, { actionType: 'edit_entry', payload: { ...timed, value: 10.6, entryId: entry.id }, expectedVersion: 99 });
    expect((await processSessionSyncBatch(samePersonNewSession, eventId, 'device', [ownSyncEdit], transaction)).receipts[0].status).toBe('accepted');
  });

  it('keeps helper corrections person-level while the host retains the override', async () => {
    const target = await ready();
    const helperUser = await pool.query<{ id: string }>("INSERT INTO users (auth0_id, name, email) VALUES ('auth|Helper','Helper','helper@test.example') RETURNING id");
    const helperWorkspace = await pool.query<{ id: string }>("INSERT INTO workspaces (name) VALUES ('Helper club') RETURNING id");
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'coach')", [helperWorkspace.rows[0].id, helperUser.rows[0].id]);
    const helperInvitation = await pool.query<{ id: string }>("INSERT INTO event_helper_invitations (event_id, secret_hash, human_code, created_by) VALUES ($1,'helper-secret','HELPC0DE',$2) RETURNING id", [eventId, host.userId]);
    await pool.query("INSERT INTO event_helper_grants (event_id, auth0_sub, invitation_id) VALUES ($1,'auth|Helper',$2)", [eventId, helperInvitation.rows[0].id]);
    const helper: Extract<MeetActor, { userId: string }> = { userId: helperUser.rows[0].id, workspaceId: helperWorkspace.rows[0].id, role: 'coach' };

    const own = await createSessionEntry(helper, eventId, target, timed, transaction);
    const hostEntry = await createSessionEntry(host, eventId, target, { ...timed, value: 10.9 }, transaction);

    await mutateSessionEntry(helper, eventId, target, own.id, { ...timed, value: 11, expectedVersion: 1 }, false, transaction);
    await expect(mutateSessionEntry(helper, eventId, target, hostEntry.id, { ...timed, value: 10, expectedVersion: 1 }, false, transaction)).rejects.toMatchObject({ status: 404 });
    await mutateSessionEntry(host, eventId, target, own.id, { ...timed, value: 11.1, expectedVersion: 2 }, false, transaction);
  });

  it('atomically finalizes official results, places and individual statistics; rolls back and reopens/refinalizes', async () => {
    await migrate();
    const s = await session();
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const visitor = await guest();
    const target = { disciplineSessionId: s.id, entrantId: athlete.id };
    const guestTarget = { disciplineSessionId: s.id, entrantId: visitor.id };
    for (const t of [target, guestTarget]) await registerEntrant(host, eventId, t, transaction);
    await open(s.id);
    const first = await createSessionEntry(host, eventId, target, timed, transaction);
    const second = await createSessionEntry(host, eventId, target, { ...timed, value: 10.9 }, transaction);
    const visitorEntry = await createSessionEntry(host, eventId, guestTarget, { ...timed, value: 10 }, transaction);
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, null, 2026)).toEqual([]);
    await expect(changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction)).rejects.toMatchObject({ code: 'OFFICIAL_SELECTION_REQUIRED' });
    await expect(selectSessionResultEntry(host, eventId, target, { entryId: visitorEntry.id, expectedVersion: 2 }, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(pool.query('UPDATE session_results SET selected_entry_id = $1 WHERE entrant_id = $2', [visitorEntry.id, athlete.id])).rejects.toMatchObject({ code: '23503' });
    const selected = await selectSessionResultEntry(host, eventId, target, { entryId: first.id, expectedVersion: 2 }, transaction);
    await selectSessionResultEntry(host, eventId, guestTarget, { entryId: visitorEntry.id, expectedVersion: 1 }, transaction);
    expect(selected).toMatchObject({ effectiveResult: 11.25, placing: 1, countsTowardsStatistics: false });
    const replaced = await selectSessionResultEntry(host, eventId, target, { entryId: second.id, expectedVersion: selected.version }, transaction);
    expect(replaced).toMatchObject({ effectiveResult: 10.9, placing: 2 });
    expect(await listSessionEntries(host, eventId, s.id, athlete.id, pool)).toHaveLength(2);
    const audit = await pool.query("SELECT * FROM meet_domain_audit WHERE entity_id = $1 AND action = 'entry_selected' ORDER BY created_at", [selected.id]);
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[1]).toMatchObject({ actor_id: host.userId, before_state: { selected_entry_id: first.id }, after_state: { selected_entry_id: second.id } });
    expect(audit.rows[1].created_at).toBeTruthy();

    // Failure at the last audit write proves result/place/lifecycle/statistics rollback.
    const failing: MeetTransaction = operation => transaction(db => operation({ query: async (sql: string, args?: unknown[]) => {
      if (sql.includes('INSERT INTO meet_domain_audit') && args?.[2] === 'session' && args?.[4] === 'finalized') throw new Error('audit unavailable');
      return db.query(sql, args);
    } } as typeof db));
    await expect(changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, failing)).rejects.toThrow('audit unavailable');
    expect((await listSessions(host, eventId, pool))[0]).toMatchObject({ status: 'in_progress', resultState: 'provisional', version: 2 });
    expect((await pool.query('SELECT final_place FROM session_results')).rows.every(r => r.final_place === null)).toBe(true);
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, null, 2026)).toEqual([]);
    const final = await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
    expect(final.resultState).toBe('final');
    await setEventStatus('completed');
    expect((await listSessionResults(host, eventId, s.id, pool)).find(r => r.entrantId === athlete.id)).toMatchObject({ placing: 2, finalPlace: 2, isPb: true, isSb: true, countsTowardsStatistics: true });
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, null, 2026)).toMatchObject([{ athleteId, pb: 10.9, sb: 10.9, seasonCount: 1, seasonAverage: 10.9, resultCount: 1 }]);
    expect((await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2025))[0]).toMatchObject({ pb: 10.9, sb: null, seasonCount: 0 });
    await expect(createSessionEntry(host, eventId, target, timed, transaction)).rejects.toMatchObject({ code: 'SESSION_NOT_IN_PROGRESS' });
    await expect(selectSessionResultEntry(host, eventId, target, { entryId: first.id, expectedVersion: replaced.version }, transaction)).rejects.toMatchObject({ code: 'SESSION_NOT_IN_PROGRESS' });
    await expect(changeSessionState({ ...host, role: 'assistant' }, eventId, s.id, { status: 'in_progress', expectedVersion: final.version }, transaction)).rejects.toMatchObject({ status: 403 });
    const reopened = await changeSessionState(host, eventId, s.id, { status: 'in_progress', expectedVersion: final.version }, transaction);
    expect(reopened.resultState).toBe('reopened');
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, null, 2026)).toEqual([]);
    expect((await pool.query('SELECT final_place FROM session_results')).rows.every(r => r.final_place === null)).toBe(true);
    const current = (await listSessionResults(host, eventId, s.id, pool)).find(r => r.entrantId === athlete.id)!;
    await selectSessionResultEntry(host, eventId, target, { entryId: first.id, expectedVersion: current.version }, transaction);
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: reopened.version }, transaction);
    expect((await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026))[0].pb).toBe(11.25);
    const lastSession = (await listSessions(host, eventId, pool))[0];
    const correction = await changeSessionState(host, eventId, s.id, { status: 'in_progress', expectedVersion: lastSession.version }, transaction);
    await mutateSessionEntry(host, eventId, target, first.id, { ...timed, value: 11.5, expectedVersion: first.version }, false, transaction);
    expect((await listSessionResults(host, eventId, s.id, pool)).find(r => r.entrantId === athlete.id)?.selectedEntryId).toBeNull();
    await createSessionEntry(host, eventId, target, { ...timed, value: null, unit: null, incidentType: 'dq' }, transaction);
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: correction.version }, transaction);
    expect(await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026)).toEqual([]);
    const club = await pool.query("INSERT INTO clubs (workspace_id, name, public_results_enabled) VALUES ($1,'Published',true) RETURNING id", [host.workspaceId]);
    const published = await publicClubSessionResults(club.rows[0].id, pool);
    expect(published[0].sessions[0]).toMatchObject({ resultState: 'final', results: [{ name: 'Guest', placing: 1 }, { name: 'Host athlete', placing: null, outcome: 'dq' }] });
  });

  it('limits official selection to each entrant own club, including the host', async () => {
    await migrate();
    await pool.query("INSERT INTO event_fixture_workspaces (event_id,workspace_id,role,status,contact_email,joined_by) VALUES ($1,$2,'guest','accepted','guest@test.example',$3)", [eventId, other.workspaceId, other.userId]);
    const outsiderUser = await pool.query("INSERT INTO users (auth0_id, name, email) VALUES ('auth|Outsider','Outsider','outsider@test.example') RETURNING id");
    const outsiderWorkspace = await pool.query("INSERT INTO workspaces (name) VALUES ('Outsider') RETURNING id");
    await pool.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'coach')", [outsiderWorkspace.rows[0].id, outsiderUser.rows[0].id]);
    const outsider: Extract<MeetActor, { userId: string }> = { userId: outsiderUser.rows[0].id, workspaceId: outsiderWorkspace.rows[0].id, role: 'coach' };

    const s = await session();
    const own = await guest();
    const foreign = await createEntrant(other, eventId, { kind: 'athlete', athleteId: otherAthleteId }, transaction);
    const ownTarget = { disciplineSessionId: s.id, entrantId: own.id };
    const foreignTarget = { disciplineSessionId: s.id, entrantId: foreign.id };
    await registerEntrant(host, eventId, ownTarget, transaction);
    await registerEntrant(other, eventId, foreignTarget, transaction);
    const opened = await open(s.id);
    const ownEntry = await createSessionEntry(host, eventId, ownTarget, { ...timed, value: 10.9 }, transaction);
    const foreignEntry = await createSessionEntry(other, eventId, foreignTarget, timed, transaction);

    await expect(selectSessionResultEntry(other, eventId, ownTarget, { entryId: ownEntry.id, expectedVersion: 1 }, transaction))
      .rejects.toMatchObject({ status: 403, code: 'WORKSPACE_CAPABILITY_DENIED' });
    await expect(selectSessionResultEntry(host, eventId, foreignTarget, { entryId: foreignEntry.id, expectedVersion: 1 }, transaction))
      .rejects.toMatchObject({ status: 403, code: 'WORKSPACE_CAPABILITY_DENIED' });
    await expect(selectSessionResultEntry(outsider, eventId, ownTarget, { entryId: ownEntry.id, expectedVersion: 1 }, transaction))
      .rejects.toMatchObject({ status: 404 });

    await selectSessionResultEntry(other, eventId, foreignTarget, { entryId: foreignEntry.id, expectedVersion: 1 }, transaction);
    await selectSessionResultEntry(host, eventId, ownTarget, { entryId: ownEntry.id, expectedVersion: 1 }, transaction);
    const board = await listSessionResults(host, eventId, s.id, pool);
    expect(board.find((row) => row.entrantId === own.id)?.selectedEntryId).toBe(ownEntry.id);
    expect(board.find((row) => row.entrantId === foreign.id)?.selectedEntryId).toBe(foreignEntry.id);

    const final = await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: opened.version }, transaction);
    expect(final.resultState).toBe('final');
  });

  it.each(['100m', '200m', 'long_jump', 'triple_jump', 'shot_put', 'discus', 'javelin', 'high_jump'])('final individual statistics respect %s policy', async code => {
    await migrate();
    const d = await definition(code);
    const s = await createSession(host, eventId, { disciplineDefinitionId: d.id, label: code, ...(d.kind === 'vertical' ? { verticalConfig: { startingHeight: 1.5, heightIncrement: 0.05, failureLimit: 3, round: 'final' as const } } : {}) }, transaction);
    const en = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const target = { disciplineSessionId: s.id, entrantId: en.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    const value = d.kind === 'vertical' ? 1.5 : 12;
    const entry = await createSessionEntry(host, eventId, target, { ...timed, value, unit: d.unit, ...(d.kind === 'vertical' ? { verticalState: 'clearance' as const } : {}) }, transaction);
    if (d.defaultRules.aggregation !== 'vertical') await selectSessionResultEntry(host, eventId, target, { entryId: entry.id, expectedVersion: 1 }, transaction);
    else await expect(selectSessionResultEntry(host, eventId, target, { entryId: entry.id, expectedVersion: 1 }, transaction)).rejects.toMatchObject({ code: 'DERIVED_RESULT_ONLY' });
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
    await setEventStatus('completed');
    expect((await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026))[0]).toMatchObject({ discipline: code, direction: d.direction, pb: value, sb: value });
  });

  it('keeps host statistics visible when the host fixture row is stale and gates progression on finalization', async () => {
    await migrate();
    const allSeasons = { selected: 'all' as const, startDate: null, endDate: null };
    const d = await definition('100m');
    const s = await createSession(host, eventId, { disciplineDefinitionId: d.id, label: 'Final' }, transaction);
    const en = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const target = { disciplineSessionId: s.id, entrantId: en.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    const entry = await createSessionEntry(host, eventId, target, timed, transaction);
    await selectSessionResultEntry(host, eventId, target, { entryId: entry.id, expectedVersion: 1 }, transaction);
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
    const { getDisciplineProgression } = await import('./disciplineProgression.js');
    // The progression chart waits for the meet itself to be completed.
    expect((await getDisciplineProgression(pool, host.workspaceId, athleteId, d.id, allSeasons)).summary.resultCount).toBe(0);

    // A revision advance used to leave the host row's accepted_revision behind,
    // silently hiding host-club results from statistics.
    await pool.query("UPDATE event_fixture_workspaces SET accepted_revision = 99 WHERE event_id = $1 AND role = 'host'", [eventId]);
    expect((await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026))[0]).toMatchObject({ resultCount: 1, pb: null, sb: null });
    expect((await getDisciplineProgression(pool, host.workspaceId, athleteId, d.id, allSeasons)).summary.resultCount).toBe(0);

    const unfinished = await createSession(host, eventId, { disciplineDefinitionId: d.id, label: 'Still running' }, transaction);
    await registerEntrant(host, eventId, { disciplineSessionId: unfinished.id, entrantId: en.id }, transaction);
    await open(unfinished.id);
    const pending = await createSessionEntry(host, eventId, { disciplineSessionId: unfinished.id, entrantId: en.id }, timed, transaction);
    await selectSessionResultEntry(host, eventId, { disciplineSessionId: unfinished.id, entrantId: en.id }, { entryId: pending.id, expectedVersion: 1 }, transaction);

    // Only the finalised session plots once the meet is over; the pending one never does.
    await setEventStatus('completed');
    expect((await getDisciplineProgression(pool, host.workspaceId, athleteId, d.id, allSeasons)).summary.resultCount).toBe(1);
    expect((await disciplineAthleteStatistics(pool, host.workspaceId, athleteId, 2026))[0]).toMatchObject({ pb: 11.25, sb: 11.25 });
  });

  it('propagates finalized 100m session results into every comparison and statistics surface', async () => {
    await migrate();
    const allSeasons = { selected: 'all' as const, startDate: null, endDate: null };
    const secondAthleteId = (await pool.query<{ id: string }>(
      'INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1,$2,$3) RETURNING id',
      [host.workspaceId, host.userId, 'Second athlete'],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id)
       SELECT $1, definition.id FROM discipline_definitions definition WHERE definition.code = '100m'`,
      [secondAthleteId],
    );
    const s = await session('100m', 'Final');
    const first = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const second = await createEntrant(host, eventId, { kind: 'athlete', athleteId: secondAthleteId }, transaction);
    const firstTarget = { disciplineSessionId: s.id, entrantId: first.id };
    const secondTarget = { disciplineSessionId: s.id, entrantId: second.id };
    for (const target of [firstTarget, secondTarget]) await registerEntrant(host, eventId, target, transaction);
    await open(s.id);
    const firstEntry = await createSessionEntry(host, eventId, firstTarget, timed, transaction);
    const secondEntry = await createSessionEntry(host, eventId, secondTarget, { ...timed, value: 10.9 }, transaction);
    await selectSessionResultEntry(host, eventId, firstTarget, { entryId: firstEntry.id, expectedVersion: 1 }, transaction);
    await selectSessionResultEntry(host, eventId, secondTarget, { entryId: secondEntry.id, expectedVersion: 1 }, transaction);
    await changeSessionState(host, eventId, s.id, { status: 'completed', expectedVersion: 2 }, transaction);
    await setEventStatus('completed');

    const { getMultiAthleteComparison, getCrossClubMultiAthleteComparison } = await import('./comparison.js');
    const comparison = await getMultiAthleteComparison(host.workspaceId, [athleteId, secondAthleteId], transaction, allSeasons);
    expect(comparison.athletes.map((athlete) => athlete.pb)).toEqual([11.25, 10.9]);
    expect(comparison.athletes[0]).toMatchObject({ validResultCount: 1, totalResultCount: 1, latestEffectiveResult: 11.25 });
    expect(comparison.athletes[0].disciplines.find((discipline) => discipline.discipline === '100m')).toMatchObject({
      pb: 11.25, validResultCount: 1, progression: [{ date: '2026-09-01', result: 11.25 }],
    });

    await pool.query(
      'INSERT INTO clubs (workspace_id, name, public_results_enabled) VALUES ($1,$2,true),($3,$2,true)',
      [host.workspaceId, 'Published', other.workspaceId],
    );
    const crossClub = await getCrossClubMultiAthleteComparison([athleteId, otherAthleteId], transaction, allSeasons);
    expect(crossClub.athletes.map((athlete) => athlete.pb)).toEqual([11.25, null]);
    expect(crossClub.athletes[1].disciplines.find((discipline) => discipline.discipline === '100m')).toMatchObject({
      pb: null, validResultCount: 0, progression: [],
    });

    const { getClubStatistics } = await import('./clubs.js');
    const hostClubId = (await pool.query<{ id: string }>('SELECT id FROM clubs WHERE workspace_id = $1', [host.workspaceId])).rows[0].id;
    expect(await getClubStatistics(hostClubId, pool, allSeasons)).toMatchObject({
      distinctAthletesWithValidResults: 2, valid100mResultCount: 2, fastestValidTime: 10.9,
    });

    const stats = await getAthleteStatisticsDetail(host.workspaceId, athleteId, '2026-09-01', transaction, allSeasons);
    expect(stats).toMatchObject({ pb: 11.25, latestResult: 11.25, latestOutcome: 'valid' });
    expect(stats.resultCounts.allTime).toBe(1);
    expect(stats.latest).toMatchObject({ effectiveResult: 11.25, effectiveOutcome: 'valid' });

    const { getAthleteProgressionDetail } = await import('./progression.js');
    const progression = await getAthleteProgressionDetail(host.workspaceId, athleteId, {}, transaction, allSeasons);
    expect(progression.summary).toEqual({ allTimePb: 11.25, totalResults: 1, totalValid: 1 });
    expect(progression.entries[0]).toMatchObject({
      effectiveResult: 11.25, effectiveOutcome: 'valid', countsTowardsStatistics: true, isNewPb: true,
    });

    const { getDashboardSummary } = await import('./dashboard.js');
    const dashboard = await getDashboardSummary(host.workspaceId, '2026-09-01', transaction, allSeasons);
    expect(dashboard.seasonPbs).toBe(2);
    const rosterEntry = dashboard.rosterSnapshot.find((row) => row.athleteId === athleteId)!;
    expect(rosterEntry.disciplines.find((row) => row.discipline === '100m')).toMatchObject({ discipline: '100m', pb: 11.25 });
    expect(dashboard.recentResults.find((entry) => entry.athlete.id === athleteId)).toMatchObject({ effectiveResult: 11.25 });
    expect(dashboard.recentPbs.find((entry) => entry.athlete.id === athleteId)).toMatchObject({ effectiveResult: 11.25 });
  });

  it('includes every eligible result in discipline progression graphs', async () => {
    await migrate();
    const allSeasons = { selected: 'all' as const, startDate: null, endDate: null };
    const sprint = await definition('100m');
    await pool.query(
      `INSERT INTO results (event_id, athlete_id, discipline, outcome, final_result)
       VALUES ($1, $2, '100m', 'valid', 11.5)`,
      [eventId, athleteId],
    );

    const sprintSession = await session('100m', 'Final');
    const longJump = await definition('long_jump');
    const longJumpSession = await session('long_jump', 'Long jump final');
    const entrant = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const sprintTarget = { disciplineSessionId: sprintSession.id, entrantId: entrant.id };
    const longJumpTarget = { disciplineSessionId: longJumpSession.id, entrantId: entrant.id };
    await registerEntrant(host, eventId, sprintTarget, transaction);
    await registerEntrant(host, eventId, longJumpTarget, transaction);

    await open(sprintSession.id);
    const sprintEntry = await createSessionEntry(host, eventId, sprintTarget, timed, transaction);
    await selectSessionResultEntry(host, eventId, sprintTarget, { entryId: sprintEntry.id, expectedVersion: 1 }, transaction);
    await changeSessionState(host, eventId, sprintSession.id, { status: 'completed', expectedVersion: 2 }, transaction);

    const { getDisciplineProgression } = await import('./disciplineProgression.js');
    // Nothing plots while the meet itself is still running.
    const running = await getDisciplineProgression(pool, host.workspaceId, athleteId, sprint.id, allSeasons);
    expect(running.summary).toEqual({ personalBest: null, resultCount: 0 });
    expect(running.entries).toEqual([]);

    await open(longJumpSession.id);
    const longJumpEntry = await createSessionEntry(host, eventId, longJumpTarget, { ...timed, value: 5.5, unit: 'metres' }, transaction);
    await selectSessionResultEntry(host, eventId, longJumpTarget, { entryId: longJumpEntry.id, expectedVersion: 1 }, transaction);
    await changeSessionState(host, eventId, longJumpSession.id, { status: 'completed', expectedVersion: 2 }, transaction);

    expect(await getDisciplineProgression(pool, host.workspaceId, athleteId, longJump.id, allSeasons)).toMatchObject({
      entries: [],
      summary: { personalBest: null, resultCount: 0 },
    });

    // Completing the meet makes every already-finalised session eligible for the chart.
    await setEventStatus('completed');
    expect(await getDisciplineProgression(pool, host.workspaceId, athleteId, sprint.id, allSeasons)).toMatchObject({
      summary: { personalBest: 11.25, resultCount: 2 },
    });
    expect((await getDisciplineProgression(pool, host.workspaceId, athleteId, sprint.id, allSeasons)).entries.map((entry) => entry.value).sort()).toEqual([11.25, 11.5]);
    expect(await getDisciplineProgression(pool, host.workspaceId, athleteId, longJump.id, allSeasons)).toMatchObject({
      entries: [{ value: 5.5 }],
      summary: { personalBest: 5.5, resultCount: 1 },
    });
  });

  it('blocks starting an event while any host or guest athlete is pending or maybe', async () => {
    await migrate();
    const { replaceEvent } = await import('./events.js');
    const start = { type: 'competition' as const, discipline: '100m' as const, title: 'Meet', date: '2026-09-01', time: null, locationName: null, latitude: null, longitude: null, status: 'in_progress' as const };
    await pool.query("INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id, rsvp_status) VALUES ($1,$2,$3,'pending')", [eventId, athleteId, host.workspaceId]);
    await expect(replaceEvent(host.workspaceId, eventId, start, transaction)).rejects.toMatchObject({ code: 'FIXTURE_PARTICIPANT_RSVPS_PENDING' });
    await pool.query("UPDATE event_participants SET rsvp_status = 'maybe' WHERE event_id = $1", [eventId]);
    await expect(replaceEvent(host.workspaceId, eventId, start, transaction)).rejects.toMatchObject({ code: 'FIXTURE_PARTICIPANT_RSVPS_PENDING' });

    await pool.query("UPDATE event_participants SET rsvp_status = 'yes' WHERE event_id = $1", [eventId]);
    await pool.query(
      `INSERT INTO event_fixture_workspaces (event_id, workspace_id, role, status, accepted_revision, contact_email)
       VALUES ($1,$2,'guest','accepted',1,'guest@test.example')`,
      [eventId, other.workspaceId],
    );
    await pool.query("INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id, rsvp_status) VALUES ($1,$2,$3,'pending')", [eventId, otherAthleteId, other.workspaceId]);
    await expect(replaceEvent(host.workspaceId, eventId, start, transaction)).rejects.toMatchObject({ code: 'FIXTURE_PARTICIPANT_RSVPS_PENDING' });

    await pool.query("UPDATE event_participants SET rsvp_status = 'yes' WHERE athlete_id = $1", [otherAthleteId]);
    const started = await replaceEvent(host.workspaceId, eventId, start, transaction);
    expect(started.status).toBe('in_progress');
  });

  it('starts a relay meet only once every relay pool athlete has RSVPed attending', async () => {
    await migrate();
    const { replaceEvent } = await import('./events.js');
    await pool.query('UPDATE events SET discipline = NULL WHERE id = $1', [eventId]);
    const start = { type: 'competition' as const, discipline: null, title: 'Meet', date: '2026-09-01', time: null, locationName: null, latitude: null, longitude: null, status: 'in_progress' as const };
    const relayDefinition = await definition('4x100m');
    const relaySession = await createSession(host, eventId, { disciplineDefinitionId: relayDefinition.id, label: '4 x 100m' }, transaction);
    const poolEntrantIds: string[] = [];
    for (const name of ['Relay One', 'Relay Two', 'Relay Three', 'Relay Four']) {
      const athlete = await pool.query('INSERT INTO athletes (workspace_id, coach_id, name) VALUES ($1,$2,$3) RETURNING id', [host.workspaceId, host.userId, name]);
      const poolAthleteId = athlete.rows[0].id as string;
      await pool.query('INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id) VALUES ($1,$2)', [poolAthleteId, relayDefinition.id]);
      const entrant = await createEntrant(host, eventId, { kind: 'athlete', athleteId: poolAthleteId }, transaction);
      poolEntrantIds.push(entrant.id);
      await pool.query("INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id, rsvp_status) VALUES ($1,$2,$3,'pending')", [eventId, poolAthleteId, host.workspaceId]);
    }

    await expect(replaceEvent(host.workspaceId, eventId, start, transaction)).rejects.toMatchObject({ code: 'FIXTURE_PARTICIPANT_RSVPS_PENDING' });

    await pool.query("UPDATE event_participants SET rsvp_status = 'yes' WHERE event_id = $1", [eventId]);
    const team = await createEntrant(host, eventId, { kind: 'relay', name: 'Speed Demons', memberIds: poolEntrantIds }, transaction);
    await registerEntrant(host, eventId, { disciplineSessionId: relaySession.id, entrantId: team.id }, transaction);
    const started = await replaceEvent(host.workspaceId, eventId, start, transaction);
    expect(started.status).toBe('in_progress');
    const legs = await pool.query('SELECT member_id FROM relay_members WHERE relay_id = $1 ORDER BY leg', [team.id]);
    expect(legs.rows.map((row) => row.member_id)).toEqual(poolEntrantIds);
  });
});
