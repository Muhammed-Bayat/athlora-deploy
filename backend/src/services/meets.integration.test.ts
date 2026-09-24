import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations, loadMigrations } from '../db/migrate.js';
import type { MeetActor, SessionEntryInput, SessionTarget } from '../types/meets.js';
import { createEntrant, createSession, changeSessionState, listDisciplines, listEntrants, listSessions, registerEntrant, updateEntrant, withdrawEntrant, type MeetTransaction } from './meets.js';
import { createSessionEntry, listSessionEntries, listSessionResults, mutateSessionEntry, overrideSessionResult, selectSessionResultEntry, sessionStatistics } from './sessionPerformances.js';
import { createTimelineEntry, listTimelineEntries, removeTimelineEntry } from './timeline.js';
import { getAthleteStatisticsDetail } from './statistics.js';
import { processSessionSyncBatch, type SessionSyncAction } from './sessionSync.js';

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
    await transaction((db) => applyMigrations(db, migrations.slice(0, -1)));
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

  async function migrate() { await transaction((db) => applyMigrations(db, migrations)); }
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
  it.each(['high_jump', 'pole_vault'])('logs, audits, finalizes and countbacks %s', async code => {
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
    expect(results.every(r => r.finalResult === 1.5 && r.countsTowardsStatistics)).toBe(true);
    const audit = await pool.query("SELECT * FROM meet_domain_audit WHERE event_id = $1 AND entity_type = 'entry'", [eventId]);
    expect(audit.rows.length).toBe(16);
  });
  function action(target: SessionTarget, overrides: Partial<SessionSyncAction> = {}): SessionSyncAction {
    return { actionId: randomUUID(), actionType: 'create_entry', target, payload: { ...timed }, clientTimestamp: new Date().toISOString(), ...overrides };
  }

  it('upgrades populated 0027 without rewriting history, is repeatable, and retains the 100m service contract', async () => {
    await pool.query("UPDATE events SET status = 'in_progress' WHERE id = $1", [eventId]);
    await pool.query("INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id, rsvp_status) VALUES ($1,$2,$3,'yes')", [eventId, athleteId, host.workspaceId]);
    const legacy = await createTimelineEntry(host.userId, eventId, { ...timed, athleteId, discipline: '100m', unit: 'seconds', isFoul: false }, transaction, host.workspaceId);
    await pool.query("UPDATE results SET manual_override = 11.1, override_reason = 'Photo finish', overridden_by = $1, override_at = now() WHERE event_id = $2", [host.userId, eventId]);
    const before = await pool.query('SELECT to_jsonb(e) AS event, (SELECT jsonb_agg(t) FROM timeline_entries t) AS timeline, (SELECT jsonb_agg(r) FROM results r) AS results FROM events e WHERE id = $1', [eventId]);
    await migrate();
    await migrate();
    const after = await pool.query('SELECT to_jsonb(e) AS event, (SELECT jsonb_agg(t) FROM timeline_entries t) AS timeline, (SELECT jsonb_agg(r) FROM results r) AS results FROM events e WHERE id = $1', [eventId]);
    expect(after.rows).toEqual(before.rows);
    expect(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count)).toBe(migrations.length);
    expect(await listTimelineEntries(host.workspaceId, eventId, pool)).toEqual([{ ...legacy, recorderName: 'Host', recorderClub: 'Host' }]);
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
    expect((await listDisciplines(pool)).map((row) => row.code)).toEqual(['10000m', '100m', '100mh', '110mh', '1500m', '200m', '3000msc', '400m', '400mh', '4x100m', '4x400m', '5000m', '5000mw', '800m', 'discus', 'hammer', 'high_jump', 'javelin', 'long_jump', 'pole_vault', 'shot_put', 'triple_jump']);
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
    await createSessionEntry(host, eventId, b, { ...timed, value: 12 }, transaction);
    await expect(mutateSessionEntry(host, eventId, b, entry.id, { ...timed, expectedVersion: 1 }, false, transaction)).rejects.toMatchObject({ status: 404 });
    const corrected = await mutateSessionEntry(host, eventId, a, entry.id, { ...timed, value: 11, expectedVersion: 1 }, false, transaction);
    expect(corrected.version).toBe(2);
    await expect(mutateSessionEntry(host, eventId, a, entry.id, { ...timed, expectedVersion: 1 }, false, transaction)).rejects.toMatchObject({ code: 'TIMELINE_ENTRY_VERSION_CONFLICT' });
    expect((await listSessionResults(host, eventId, first.id, pool))[0]).toMatchObject({ ...a, finalResult: 11 });
    expect((await listSessionResults(host, eventId, second.id, pool))[0]).toMatchObject({ ...b, finalResult: 12 });
    await overrideSessionResult(host, eventId, a, { manualOverride: 10.9, overrideReason: 'Photo', expectedVersion: 2 }, transaction);
    expect((await sessionStatistics(host, eventId, first.id, entrant.id, pool)).best).toBe(10.9);
    await mutateSessionEntry(host, eventId, a, entry.id, { expectedVersion: 2 }, true, transaction);
    expect((await listSessionResults(host, eventId, first.id, pool))[0]).toMatchObject({ outcome: 'no_result', effectiveResult: 10.9, effectiveOutcome: 'valid' });
    const audit = await pool.query('SELECT * FROM meet_domain_audit WHERE entity_id = $1 ORDER BY created_at', [entry.id]);
    expect(audit.rows.map((row) => row.action)).toEqual(['created', 'corrected', 'undone']);
    expect(audit.rows.every((row) => row.actor_id === host.userId && row.public_logger_session_id === null)).toBe(true);
    expect((await pool.query('SELECT * FROM results')).rows).toEqual([]);
    expect((await pool.query('SELECT * FROM timeline_entries')).rows).toEqual([]);
  });

  it('supports coach-selected official relay entries, roster edits, 4x400m size checks, and keeps individual stats isolated', async () => {
    await migrate();
    const athlete = await createEntrant(host, eventId, { kind: 'athlete', athleteId }, transaction);
    const guests = await Promise.all(['A', 'B', 'C'].map((name) => guest(name)));
    const relay = await createEntrant(host, eventId, { kind: 'relay', name: 'Team', memberIds: [athlete.id, ...guests.map((g) => g.id)] }, transaction);
    const session400 = await session('4x400m', '4x400 Final');
    const target = { disciplineSessionId: session400.id, entrantId: relay.id };
    await registerEntrant(host, eventId, target, transaction);
    await open(session400.id);
    const first = await createSessionEntry(host, eventId, target, { ...timed, value: 62.1 }, transaction);
    const second = await createSessionEntry(host, eventId, target, { ...timed, value: 61.4 }, transaction);
    expect((await listSessionResults(host, eventId, session400.id, pool)).find((r) => r.entrantId === relay.id)).toMatchObject({ finalResult: 61.4, selectedEntryId: null });
    const selected = await selectSessionResultEntry(host, eventId, target, { entryId: first.id, expectedVersion: 2 }, transaction);
    expect(selected).toMatchObject({ finalResult: 62.1, selectedEntryId: first.id, placing: 1 });
    await expect(selectSessionResultEntry(host, eventId, target, { entryId: first.id, expectedVersion: 99 }, transaction)).rejects.toMatchObject({ code: 'RESULT_VERSION_CONFLICT' });
    await expect(selectSessionResultEntry({ ...host, role: 'assistant' as const }, eventId, target, { entryId: first.id, expectedVersion: 3 }, transaction)).rejects.toMatchObject({ status: 403 });
    await mutateSessionEntry(host, eventId, target, second.id, { expectedVersion: 2 }, true, transaction);
    expect((await listSessionResults(host, eventId, session400.id, pool)).find((r) => r.entrantId === relay.id)).toMatchObject({ finalResult: 62.1, selectedEntryId: first.id });
    expect((await pool.query('SELECT * FROM results')).rows).toEqual([]);
    const history = await getAthleteStatisticsDetail(host.workspaceId, athleteId, '2026-09-01', transaction);
    expect(history.pb).toBeNull();
    await expect(updateEntrant(host, eventId, relay.id, { memberIds: [guests[0].id, athlete.id, guests[1].id, guests[2].id] }, transaction)).rejects.toMatchObject({ code: 'ROSTER_LOCKED' });
    await pool.query("UPDATE events SET status = 'scheduled' WHERE id = $1", [eventId]);
    await pool.query('DELETE FROM session_timeline_entries');
    await pool.query('DELETE FROM session_results');
    const updated = await updateEntrant(host, eventId, relay.id, { name: 'Renamed', memberIds: [guests[0].id, athlete.id, guests[1].id, guests[2].id] }, transaction);
    expect(updated).toMatchObject({ name: 'Renamed', memberIds: [guests[0].id, athlete.id, guests[1].id, guests[2].id] });
    const { athleteRelayHistory } = await import('./relayHistory.js');
    const relayHistory = await athleteRelayHistory(host.workspaceId, athleteId, pool);
    expect(relayHistory.some((row) => row.teamName === 'Renamed' && row.countsAsIndividualResult === false)).toBe(true);
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
    await createSessionEntry(host, eventId, target, { ...timed, unit: 'metres', value: 6.2 }, transaction);
    await createSessionEntry(host, eventId, target, { ...timed, unit: 'metres', value: 7, isFoul: true }, transaction);
    expect(await sessionStatistics(host, eventId, s.id, undefined, pool)).toMatchObject({ direction: 'higher', best: 6.2, validResultCount: 1 });
    await withdrawEntrant(host, eventId, target, transaction);
    expect(await sessionStatistics(host, eventId, s.id, undefined, pool)).toMatchObject({ best: null, validResultCount: 0, resultCount: 1 });
    await expect(createSessionEntry(host, eventId, target, { ...timed, unit: 'metres' }, transaction)).rejects.toMatchObject({ code: 'ENTRANT_WITHDRAWN' });
  });

  it('limits fixture guests to their own entrants and rejects stale fixture acceptance', async () => {
    await migrate();
    await pool.query("INSERT INTO event_fixture_workspaces (event_id,workspace_id,role,status,contact_email,joined_by) VALUES ($1,$2,'guest','accepted','guest@test.example',$3)", [eventId, other.workspaceId, other.userId]);
    const s = await session();
    const own = await guest();
    const visiting = await createEntrant(other, eventId, { kind: 'athlete', athleteId: otherAthleteId }, transaction);
    await expect(createSession(other, eventId, { disciplineDefinitionId: (await definition()).id, label: 'Not host' }, transaction)).rejects.toMatchObject({ status: 404 });
    await expect(registerEntrant(other, eventId, { disciplineSessionId: s.id, entrantId: own.id }, transaction)).rejects.toMatchObject({ status: 404 });
    const target = { disciplineSessionId: s.id, entrantId: visiting.id };
    await registerEntrant(other, eventId, target, transaction);
    expect((await listEntrants(other, eventId, pool)).map((row) => row.id)).toEqual([visiting.id]);
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
    const official = { publicLoggerSessionId: publicSessions.rows[0].id };
    const first = action(target);
    await processSessionSyncBatch(official, eventId, 'device', [first], transaction);
    const edit = action(target, { actionType: 'edit_entry', payload: { ...timed, value: 10.8, entryId: first.actionId }, expectedVersion: 99 });
    expect((await processSessionSyncBatch(official, eventId, 'device', [edit], transaction)).receipts[0].status).toBe('accepted');
    const conflicts = await pool.query('SELECT * FROM public_sync_conflict_log');
    expect(conflicts.rows[0]).toMatchObject({ discipline_session_id: target.disciplineSessionId, entrant_id: target.entrantId, overwritten_version: 1 });
    const denied = await processSessionSyncBatch({ publicLoggerSessionId: publicSessions.rows[1].id }, eventId, 'device', [{ ...edit, actionId: randomUUID() }], transaction);
    expect(denied.receipts[0]).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
    await pool.query("UPDATE public_logger_links SET status = 'revoked' WHERE id = $1", [link.rows[0].id]);
    await expect(processSessionSyncBatch(official, eventId, 'device', [action(target)], transaction)).rejects.toMatchObject({ status: 404 });
  });
});
