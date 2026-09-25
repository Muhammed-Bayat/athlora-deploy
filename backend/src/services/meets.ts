import { getPool, type DbExecutor } from '../db/client.js';
import { mapMeetRow } from '../db/meet-row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import type { DisciplineDefinition, DisciplineSession, EntrantCreateInput, EntrantUpdateInput, MeetActor, MeetEntrant, SafeRelayMember, SessionCreateInput, SessionRegistration, SessionStateInput, SessionTarget } from '../types/meets.js';
import { assertValidTransition } from './events.js';
import { parseVerticalConfig, validateVerticalDefinition } from '../validation/verticalMeets.js';
import { canReadEntrant, meetAccess, meetAudit, meetCoach, meetConflict, meetIds, meetNotFound } from './meetAccess.js';
import { listSessionResults, recomputeSessionResult } from './sessionPerformances.js';

export type MeetTransaction = <T>(operation: (db: DbExecutor) => Promise<T>) => Promise<T>;

export async function listDisciplines(db: DbExecutor = getPool()): Promise<DisciplineDefinition[]> {
  const result = await db.query('SELECT * FROM discipline_definitions ORDER BY code, version');
  return result.rows.map((row) => mapMeetRow<DisciplineDefinition>(row));
}

export async function getSession(db: DbExecutor, eventId: string, sessionId: string): Promise<DisciplineSession> {
  meetIds(eventId, sessionId);
  const result = await db.query('SELECT * FROM discipline_sessions WHERE id = $1 AND event_id = $2', [sessionId, eventId]);
  if (!result.rows[0]) meetNotFound();
  return mapMeetRow<DisciplineSession>(result.rows[0]);
}

export async function getDefinition(db: DbExecutor, id: string): Promise<DisciplineDefinition> {
  meetIds(id);
  const result = await db.query('SELECT * FROM discipline_definitions WHERE id = $1', [id]);
  if (!result.rows[0]) meetNotFound();
  return mapMeetRow<DisciplineDefinition>(result.rows[0]);
}

export async function listSessions(actor: MeetActor, eventId: string, db: DbExecutor = getPool()): Promise<DisciplineSession[]> {
  await meetAccess(db, actor, eventId);
  const result = await db.query('SELECT * FROM discipline_sessions WHERE event_id = $1 ORDER BY created_at, id', [eventId]);
  return result.rows.map((row) => mapMeetRow<DisciplineSession>(row));
}

export async function createSession(actor: MeetActor, eventId: string, input: SessionCreateInput, transaction: MeetTransaction = withTransaction): Promise<DisciplineSession> {
  if (!('userId' in actor)) meetNotFound();
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (!access.host) meetNotFound();
    if (!['scheduled', 'in_progress'].includes(access.event.status)) meetConflict('EVENT_CLOSED', 'The event is closed');
    const definition = await getDefinition(db, input.disciplineDefinitionId);
    if (definition.kind === 'vertical') { validateVerticalDefinition(definition); parseVerticalConfig(input.verticalConfig); }
    else if (input.verticalConfig) meetConflict('INVALID_CONFIGURATION', 'Vertical configuration requires a vertical discipline');
    const result = await db.query(
      `INSERT INTO discipline_sessions (event_id, workspace_id, discipline_definition_id, label, created_by, updated_by, vertical_config)
       VALUES ($1,$2,$3,$4,$5,$5,$6) RETURNING *`,
      [eventId, access.event.workspace_id, input.disciplineDefinitionId, input.label, actor.userId, input.verticalConfig ?? null],
    );
    const session = mapMeetRow<DisciplineSession>(result.rows[0]);
    await meetAudit(db, actor, eventId, session.workspaceId, 'session', session.id, 'created', null, session);
    return session;
  });
}

export async function changeSessionState(actor: MeetActor, eventId: string, sessionId: string, input: SessionStateInput, transaction: MeetTransaction = withTransaction): Promise<DisciplineSession> {
  meetCoach(actor);
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (!access.host) meetNotFound();
    const before = await getSession(db, eventId, sessionId);
    if (before.version !== input.expectedVersion) meetConflict('SESSION_VERSION_CONFLICT', 'Session has been modified');
    const reopening = before.status === 'completed' && input.status === 'in_progress';
    if (!reopening) assertValidTransition(before.status, input.status);
    if (access.event.status === 'cancelled') meetConflict('EVENT_CLOSED', 'The event is cancelled');
    if (input.status === 'in_progress' && !reopening && access.event.status !== 'in_progress') meetConflict('EVENT_NOT_IN_PROGRESS', 'The event must be in progress');
    if (input.status === 'completed' && before.resultState !== 'final') {
      const definition = await getDefinition(db, before.disciplineDefinitionId);
      const registrations = await db.query<{ entrant_id: string; workspace_id: string }>('SELECT entrant_id, workspace_id FROM session_entrants WHERE session_id = $1 AND withdrawn_at IS NULL', [sessionId]);
      for (const entrant of registrations.rows) {
        await recomputeSessionResult(db, actor, eventId, { disciplineSessionId: sessionId, entrantId: entrant.entrant_id }, entrant.workspace_id, definition);
      }
      const board = await listSessionResults(actor, eventId, sessionId, db);
      if (definition.defaultRules.aggregation === 'timed') {
        const pending = await db.query(`SELECT 1 FROM session_results r JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
          WHERE r.session_id = $1 AND se.withdrawn_at IS NULL AND r.selected_entry_id IS NULL AND r.outcome = 'no_result'
          AND EXISTS (SELECT 1 FROM session_timeline_entries t WHERE t.session_id = r.session_id AND t.entrant_id = r.entrant_id AND t.deleted_at IS NULL AND t.entry_type = 'attempt' AND t.value > 0 AND NOT t.is_foul) LIMIT 1`, [sessionId]);
        if (pending.rows.length) meetConflict('OFFICIAL_SELECTION_REQUIRED', 'Select an official time for every entrant with recorded times');
      }
      for (const row of board) {
        await db.query('UPDATE session_results SET final_place = $1 WHERE id = $2', [row.placing, row.id]);
        await meetAudit(db, actor, eventId, row.workspaceId, 'result', row.id, 'finalized', row, { ...row, finalPlace: row.placing });
      }
    }
    if (reopening || input.status === 'cancelled') await db.query('UPDATE session_results SET final_place = NULL WHERE session_id = $1', [sessionId]);
    const result = await db.query(
      `UPDATE discipline_sessions SET status = $1, version = version + 1, updated_by = $2, updated_at = now(), result_state = $4
       WHERE id = $3 RETURNING *`, [input.status, actor.userId, sessionId, input.status === 'completed' ? 'final' : reopening ? 'reopened' : input.status === 'cancelled' ? 'provisional' : before.resultState ?? 'provisional'],
    );
    const after = mapMeetRow<DisciplineSession>(result.rows[0]);
    await meetAudit(db, actor, eventId, after.workspaceId, 'session', sessionId, reopening ? 'reopened' : input.status === 'completed' ? 'finalized' : 'state_changed', before, after);
    return after;
  });
}

export async function listEntrants(actor: MeetActor, eventId: string, db: DbExecutor = getPool()): Promise<MeetEntrant[]> {
  const access = await meetAccess(db, actor, eventId);
  const result = await db.query(
    `SELECT en.*, COALESCE((SELECT json_agg(rm.member_id ORDER BY rm.leg) FROM relay_members rm WHERE rm.relay_id = en.id), '[]') AS member_ids
     FROM meet_entrants en WHERE en.event_id = $1
       AND ($2::boolean OR en.workspace_id = $3) ORDER BY en.created_at, en.id`,
    [eventId, access.host || access.helper, 'workspaceId' in actor ? actor.workspaceId : null],
  );
  return result.rows.map((row) => mapMeetRow<MeetEntrant>(row));
}

export async function createEntrant(actor: MeetActor, eventId: string, input: EntrantCreateInput, transaction: MeetTransaction = withTransaction): Promise<MeetEntrant> {
  meetCoach(actor);
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (access.helper) meetNotFound();
    if (access.event.status !== 'scheduled') meetConflict('ROSTER_LOCKED', 'Entrants must be created before the event starts');
    let name: string;
    if (input.kind === 'athlete') {
      meetIds(input.athleteId);
      const athlete = await db.query<{ name: string }>('SELECT name FROM athletes WHERE id = $1 AND workspace_id = $2 AND lifecycle_status = \'active\'', [input.athleteId, actor.workspaceId]);
      if (!athlete.rows[0]) meetNotFound();
      name = athlete.rows[0].name;
      const duplicate = await db.query('SELECT 1 FROM meet_entrants WHERE event_id = $1 AND athlete_id = $2', [eventId, input.athleteId]);
      if (duplicate.rows.length) meetConflict('ENTRANT_EXISTS', 'Athlete is already an entrant');
    } else name = input.name;
    const members: Array<{ id: string; kind: string }> = [];
    if (input.kind === 'relay') {
      meetIds(...input.memberIds);
      const result = await db.query<{ id: string; kind: string }>(
        `SELECT id, kind FROM meet_entrants WHERE id = ANY($1::uuid[]) AND event_id = $2 AND workspace_id = $3 AND kind <> 'relay'`,
        [input.memberIds, eventId, actor.workspaceId],
      );
      if (result.rows.length !== input.memberIds.length) meetNotFound();
      members.push(...input.memberIds.map((id) => result.rows.find((row) => row.id === id)!));
    }
    const result = await db.query(
      `INSERT INTO meet_entrants (event_id, workspace_id, kind, athlete_id, name, club_name, details, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        eventId,
        actor.workspaceId,
        input.kind,
        input.kind === 'athlete' ? input.athleteId : null,
        name,
        input.kind === 'guest' ? input.clubName : null,
        input.kind === 'guest' ? input.details : null,
        actor.userId,
      ],
    );
    const entrant = mapMeetRow<MeetEntrant>({ ...result.rows[0], member_ids: members.map((member) => member.id) });
    for (const [index, member] of members.entries()) {
      const membership = await db.query(
        `INSERT INTO relay_members (event_id, workspace_id, relay_id, member_id, member_kind, leg, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [eventId, actor.workspaceId, entrant.id, member.id, member.kind, index + 1, actor.userId],
      );
      await meetAudit(db, actor, eventId, actor.workspaceId, 'relay_member', membership.rows[0].id, 'created', null, membership.rows[0]);
    }
    await meetAudit(db, actor, eventId, actor.workspaceId, 'entrant', entrant.id, 'created', null, entrant);
    return entrant;
  });
}

export async function updateEntrant(actor: MeetActor, eventId: string, entrantId: string, input: EntrantUpdateInput, transaction: MeetTransaction = withTransaction): Promise<MeetEntrant> {
  meetCoach(actor);
  meetIds(entrantId);
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (access.helper) meetNotFound();
    if (access.event.status !== 'scheduled') meetConflict('ROSTER_LOCKED', 'Entrants can only be edited before the event starts');
    const found = await db.query('SELECT * FROM meet_entrants WHERE id = $1 AND event_id = $2 AND workspace_id = $3', [entrantId, eventId, actor.workspaceId]);
    const before = found.rows[0];
    if (!before) meetNotFound();
    if (before.kind !== 'relay') meetConflict('INVALID_ENTRANT_KIND', 'Only relay teams can be edited');
    const logging = await db.query(
      `SELECT 1 FROM session_timeline_entries se
       JOIN session_entrants sr ON sr.session_id = se.session_id AND sr.entrant_id = se.entrant_id
       WHERE se.entrant_id = $1 AND se.deleted_at IS NULL LIMIT 1`,
      [entrantId],
    );
    if (logging.rows[0]) meetConflict('ROSTER_LOCKED', 'Team composition is frozen after logging has started');
    if (input.memberIds) {
      meetIds(...input.memberIds);
      const members = await db.query<{ id: string; kind: string }>(
        `SELECT id, kind FROM meet_entrants WHERE id = ANY($1::uuid[]) AND event_id = $2 AND workspace_id = $3 AND kind <> 'relay'`,
        [input.memberIds, eventId, actor.workspaceId],
      );
      if (members.rows.length !== input.memberIds.length) meetNotFound();
      await db.query('DELETE FROM relay_members WHERE relay_id = $1', [entrantId]);
      for (const [index, memberId] of input.memberIds.entries()) {
        const member = members.rows.find((row) => row.id === memberId)!;
        const membership = await db.query(
          `INSERT INTO relay_members (event_id, workspace_id, relay_id, member_id, member_kind, leg, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [eventId, actor.workspaceId, entrantId, member.id, member.kind, index + 1, actor.userId],
        );
        await meetAudit(db, actor, eventId, actor.workspaceId, 'relay_member', membership.rows[0].id, 'created', null, membership.rows[0]);
      }
    }
    const name = input.name ?? before.name;
    await db.query('UPDATE meet_entrants SET name = $1 WHERE id = $2', [name, entrantId]);
    const updated = await listEntrants(actor, eventId, db);
    const entrant = updated.find((row) => row.id === entrantId)!;
    await meetAudit(db, actor, eventId, actor.workspaceId, 'entrant', entrantId, 'updated', before, entrant);
    return entrant;
  });
}

export async function listSafeRelayMembers(eventId: string, relayId: string, db: DbExecutor = getPool()): Promise<SafeRelayMember[]> {
  const result = await db.query<{ leg: number; name: string; member_kind: string }>(
    `SELECT rm.leg, en.name, rm.member_kind
     FROM relay_members rm
     JOIN meet_entrants en ON en.id = rm.member_id AND en.event_id = rm.event_id
     WHERE rm.relay_id = $1 AND rm.event_id = $2
     ORDER BY rm.leg`,
    [relayId, eventId],
  );
  return result.rows.map((row) => ({ leg: Number(row.leg), name: row.name, isGuest: row.member_kind === 'guest' }));
}

export async function listRegistrations(actor: MeetActor, eventId: string, sessionId: string, db: DbExecutor = getPool()): Promise<SessionRegistration[]> {
  const access = await meetAccess(db, actor, eventId);
  await getSession(db, eventId, sessionId);
  const result = await db.query('SELECT * FROM session_entrants WHERE session_id = $1 ORDER BY created_at, id', [sessionId]);
  return result.rows.filter((row) => canReadEntrant(actor, access, row.workspace_id)).map((row) => mapMeetRow<SessionRegistration>(row));
}

export async function registerEntrant(actor: MeetActor, eventId: string, target: SessionTarget, transaction: MeetTransaction = withTransaction): Promise<SessionRegistration> {
  meetCoach(actor);
  meetIds(target.disciplineSessionId, target.entrantId);
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (access.helper) meetNotFound();
    const session = await getSession(db, eventId, target.disciplineSessionId);
    if (session.status !== 'scheduled' || !['scheduled', 'in_progress'].includes(access.event.status)) meetConflict('ROSTER_LOCKED', 'Session registration is closed');
    const entrant = await db.query<{ kind: string }>('SELECT kind FROM meet_entrants WHERE id = $1 AND event_id = $2 AND workspace_id = $3', [target.entrantId, eventId, actor.workspaceId]);
    if (!entrant.rows[0]) meetNotFound();
    const definition = await getDefinition(db, session.disciplineDefinitionId);
    if ((entrant.rows[0].kind === 'relay') !== (definition.defaultRules.entrantType === 'relay')) meetConflict('ENTRANT_KIND_MISMATCH', 'Entrant type does not match the discipline');
    if (definition.defaultRules.teamSize) {
      const members = await db.query('SELECT id FROM relay_members WHERE relay_id = $1', [target.entrantId]);
      if (members.rows.length !== definition.defaultRules.teamSize) meetConflict('RELAY_SIZE_MISMATCH', 'Relay size does not match the discipline');
    }
    const existing = await db.query('SELECT * FROM session_entrants WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId]);
    if (existing.rows[0]) {
      if (existing.rows[0].withdrawn_at) meetConflict('ENTRANT_WITHDRAWN', 'Registration has been withdrawn');
      return mapMeetRow<SessionRegistration>(existing.rows[0]);
    }
    const result = await db.query(
      `INSERT INTO session_entrants (event_id, session_id, entrant_id, workspace_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [eventId, target.disciplineSessionId, target.entrantId, actor.workspaceId, actor.userId],
    );
    const registration = mapMeetRow<SessionRegistration>(result.rows[0]);
    await meetAudit(db, actor, eventId, actor.workspaceId, 'registration', registration.id, 'created', null, registration);
    return registration;
  });
}

export async function withdrawEntrant(actor: MeetActor, eventId: string, target: SessionTarget, transaction: MeetTransaction = withTransaction): Promise<void> {
  meetCoach(actor);
  meetIds(target.disciplineSessionId, target.entrantId);
  await transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (access.helper) meetNotFound();
    const session = await getSession(db, eventId, target.disciplineSessionId);
    if (['completed', 'cancelled'].includes(session.status) || access.event.status === 'cancelled') meetConflict('SESSION_CLOSED', 'Reopen the session before withdrawing an entrant');
    const before = await db.query('SELECT * FROM session_entrants WHERE event_id = $1 AND session_id = $2 AND entrant_id = $3 AND workspace_id = $4', [eventId, target.disciplineSessionId, target.entrantId, actor.workspaceId]);
    if (!before.rows[0]) meetNotFound();
    if (before.rows[0].withdrawn_at) return;
    const after = await db.query('UPDATE session_entrants SET withdrawn_at = now(), withdrawn_by = $1 WHERE id = $2 RETURNING *', [actor.userId, before.rows[0].id]);
    await meetAudit(db, actor, eventId, actor.workspaceId, 'registration', before.rows[0].id, 'withdrawn', before.rows[0], after.rows[0]);
  });
}
