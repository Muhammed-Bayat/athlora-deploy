import { getPool, type DbExecutor } from '../db/client.js';
import { mapMeetRow } from '../db/meet-row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import type { DisciplineDefinition, DisciplineSession, EntrantCreateInput, EntrantUpdateInput, EventFinalResult, MeetActor, MeetEntrant, SafeRelayMember, SessionCreateInput, SessionEntry, SessionRegistration, SessionStateInput, SessionTarget } from '../types/meets.js';
import { assertValidTransition } from './events.js';
import { parseVerticalConfig, validateVerticalDefinition } from '../validation/verticalMeets.js';
import { meetAccess, meetAudit, meetCoach, meetConflict, meetIds, meetNotFound } from './meetAccess.js';
import { listSessionResults, loadRelayMembers, recomputeSessionResult } from './sessionPerformances.js';
import { relayLegResults } from './relayDerivation.js';
import { performanceFlags, relayLegHistory, type PriorPerformance } from './disciplineStatistics.js';
import { SUPPORTED_DISCIPLINE_CODES } from './disciplineCatalog.js';

export type MeetTransaction = <T>(operation: (db: DbExecutor) => Promise<T>) => Promise<T>;

export async function listDisciplines(db: DbExecutor = getPool()): Promise<DisciplineDefinition[]> {
  const result = await db.query(
    'SELECT * FROM discipline_definitions WHERE code = ANY($1::text[]) ORDER BY code, version',
    [SUPPORTED_DISCIPLINE_CODES],
  );
  return result.rows.map((row) => mapMeetRow<DisciplineDefinition>(row));
}

export async function getSession(db: DbExecutor, eventId: string, sessionId: string): Promise<DisciplineSession> {
  meetIds(eventId, sessionId);
  const result = await db.query(
    `SELECT s.* FROM discipline_sessions s
     JOIN discipline_definitions d ON d.id = s.discipline_definition_id
     WHERE s.id = $1 AND s.event_id = $2 AND d.code = ANY($3::text[])`,
    [sessionId, eventId, SUPPORTED_DISCIPLINE_CODES],
  );
  if (!result.rows[0]) meetNotFound();
  return mapMeetRow<DisciplineSession>(result.rows[0]);
}

export async function getDefinition(db: DbExecutor, id: string): Promise<DisciplineDefinition> {
  meetIds(id);
  const result = await db.query(
    'SELECT * FROM discipline_definitions WHERE id = $1 AND code = ANY($2::text[])',
    [id, SUPPORTED_DISCIPLINE_CODES],
  );
  if (!result.rows[0]) meetNotFound();
  return mapMeetRow<DisciplineDefinition>(result.rows[0]);
}

export async function listSessions(actor: MeetActor, eventId: string, db: DbExecutor = getPool()): Promise<DisciplineSession[]> {
  await meetAccess(db, actor, eventId);
  const result = await db.query(
    `SELECT s.* FROM discipline_sessions s
     JOIN discipline_definitions d ON d.id = s.discipline_definition_id
     WHERE s.event_id = $1 AND d.code = ANY($2::text[])
     ORDER BY s.created_at, s.id`,
    [eventId, SUPPORTED_DISCIPLINE_CODES],
  );
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
      const unresolvedConflicts = await db.query(
        'SELECT 1 FROM offline_sync_conflicts WHERE event_id = $1 AND discipline_session_id = $2 AND resolved_at IS NULL LIMIT 1',
        [eventId, sessionId],
      );
      if (unresolvedConflicts.rows.length) meetConflict('OFFLINE_CONFLICT_RESOLUTION_REQUIRED', 'Resolve offline conflicts before finalizing');
      const registrations = await db.query<{ entrant_id: string; workspace_id: string }>('SELECT entrant_id, workspace_id FROM session_entrants WHERE session_id = $1 AND withdrawn_at IS NULL', [sessionId]);
      for (const entrant of registrations.rows) {
        await recomputeSessionResult(db, actor, eventId, { disciplineSessionId: sessionId, entrantId: entrant.entrant_id }, entrant.workspace_id, definition);
      }
      const board = await listSessionResults(actor, eventId, sessionId, db);
      if (definition.defaultRules.entrantType === 'relay') {
        // A relay team is complete only when every athlete's split has an official result.
        const pending = await db.query(
          `SELECT 1 FROM session_entrants se
           WHERE se.session_id = $1 AND se.withdrawn_at IS NULL
             AND EXISTS (SELECT 1 FROM session_timeline_entries t
               WHERE t.session_id = se.session_id AND t.entrant_id = se.entrant_id AND t.deleted_at IS NULL
                 AND t.relay_member_id IS NOT NULL AND t.entry_type = 'attempt' AND t.value > 0 AND NOT t.is_foul)
             AND NOT EXISTS (SELECT 1 FROM session_timeline_entries t2
               WHERE t2.session_id = se.session_id AND t2.entrant_id = se.entrant_id AND t2.deleted_at IS NULL
                 AND t2.relay_member_id IS NULL AND t2.incident_type IN ('dq', 'dnf', 'dns'))
             AND (SELECT COUNT(*) FROM session_relay_selections sr
               JOIN session_timeline_entries e ON e.id = sr.entry_id AND e.deleted_at IS NULL
                 AND e.entry_type = 'attempt' AND e.value > 0 AND NOT e.is_foul AND e.incident_type IS NULL
               WHERE sr.session_id = se.session_id AND sr.entrant_id = se.entrant_id) < $2
           LIMIT 1`,
          [sessionId, definition.defaultRules.teamSize ?? 4],
        );
        if (pending.rows.length) meetConflict('RELAY_RESULTS_INCOMPLETE', 'Record an official result for every athlete on each relay team before finalizing');
      } else if (definition.defaultRules.aggregation === 'timed' || definition.defaultRules.aggregation === 'best') {
        const pending = await db.query(`SELECT 1 FROM session_results r JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
          WHERE r.session_id = $1 AND se.withdrawn_at IS NULL AND r.selected_entry_id IS NULL AND r.outcome = 'no_result'
          AND EXISTS (SELECT 1 FROM session_timeline_entries t WHERE t.session_id = r.session_id AND t.entrant_id = r.entrant_id AND t.deleted_at IS NULL AND t.entry_type = 'attempt' AND t.value > 0 AND NOT t.is_foul) LIMIT 1`, [sessionId]);
        if (pending.rows.length) meetConflict('OFFICIAL_SELECTION_REQUIRED', 'Select an official result for every entrant with recorded attempts');
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
  await meetAccess(db, actor, eventId);
  const result = await db.query(
    `SELECT en.*, COALESCE((SELECT json_agg(rm.member_id ORDER BY rm.leg) FROM relay_members rm WHERE rm.relay_id = en.id), '[]') AS member_ids,
       COALESCE((SELECT json_agg(json_build_object('relayMemberId', rm.id, 'leg', rm.leg, 'name', member.name, 'isGuest', rm.member_kind = 'guest') ORDER BY rm.leg)
         FROM relay_members rm
         JOIN meet_entrants member ON member.id = rm.member_id AND member.event_id = rm.event_id
         WHERE rm.relay_id = en.id), '[]') AS members,
       (SELECT w.name FROM workspaces w WHERE w.id = en.workspace_id) AS workspace_name,
       (SELECT ep.rsvp_status FROM event_participants ep
         WHERE ep.event_id = en.event_id AND ep.athlete_id = en.athlete_id AND ep.participant_workspace_id = en.workspace_id) AS rsvp_status
     FROM meet_entrants en WHERE en.event_id = $1
     ORDER BY en.created_at, en.id`,
    [eventId],
  );
  return result.rows.map((row) => mapMeetRow<MeetEntrant>(row));
}

export async function listEventFinalResults(actor: MeetActor, eventId: string, db: DbExecutor = getPool()): Promise<EventFinalResult[]> {
  const access = await meetAccess(db, actor, eventId);
  if (access.event.status !== 'completed') return [];
  const result = await db.query<{
    entrant_id: string; name: string; club_name: string; code: string; discipline_label: string;
    final_result: string | null; outcome: EventFinalResult['outcome']; unit: EventFinalResult['unit'];
    precision: string | number; final_place: string | null; relay_members: string[]; entrant_type: string;
    session_id: string; direction: DisciplineDefinition['direction']; workspace_id: string;
  }>(
    `SELECT en.id AS entrant_id, en.name, COALESCE(en.club_name, c.name, w.name) AS club_name,
            d.code, d.presentation->>'label' AS discipline_label, r.final_result, r.outcome,
            d.unit, d.precision, r.final_place, d.default_rules->>'entrantType' AS entrant_type,
            r.workspace_id, s.id AS session_id, d.direction,
            COALESCE((SELECT json_agg(member.name ORDER BY rm.leg)
              FROM relay_members rm
              JOIN meet_entrants member ON member.id = rm.member_id AND member.event_id = rm.event_id
              WHERE rm.relay_id = en.id AND rm.event_id = en.event_id), '[]'::json) AS relay_members
     FROM session_results r
     JOIN discipline_sessions s ON s.id = r.session_id AND s.event_id = r.event_id
     JOIN discipline_definitions d ON d.id = s.discipline_definition_id
     JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id AND se.withdrawn_at IS NULL
     JOIN meet_entrants en ON en.id = r.entrant_id AND en.event_id = r.event_id
     LEFT JOIN clubs c ON c.workspace_id = en.workspace_id
     LEFT JOIN workspaces w ON w.id = en.workspace_id
     WHERE r.event_id = $1 AND s.status = 'completed' AND s.result_state = 'final'
       AND d.code = ANY($2::text[])
     ORDER BY array_position($2::text[], d.code), r.final_place NULLS LAST, lower(en.name), en.id`,
    [eventId, SUPPORTED_DISCIPLINE_CODES],
  );
  const relayIds = result.rows.filter((row) => row.entrant_type === 'relay').map((row) => row.entrant_id);
  const members = await loadRelayMembers(db, relayIds);
  const relayEntries = relayIds.length === 0 ? [] : (await db.query(
    'SELECT * FROM session_timeline_entries WHERE event_id = $1 AND entrant_id = ANY($2::uuid[]) AND deleted_at IS NULL ORDER BY created_at, id',
    [eventId, relayIds],
  )).rows.map((row) => mapMeetRow<SessionEntry>(row));
  const selectionRows = relayIds.length === 0 ? [] : (await db.query<{ entrant_id: string; relay_member_id: string; entry_id: string }>(
    'SELECT entrant_id, relay_member_id, entry_id FROM session_relay_selections WHERE event_id = $1',
    [eventId],
  )).rows;
  const selections = new Map<string, Map<string, string>>();
  for (const row of selectionRows) {
    const map = selections.get(row.entrant_id) ?? new Map<string, string>();
    map.set(row.relay_member_id, row.entry_id);
    selections.set(row.entrant_id, map);
  }
  const eventDate = (await db.query<{ date: string }>("SELECT to_char(date, 'YYYY-MM-DD') AS date FROM events WHERE id = $1", [eventId])).rows[0]?.date ?? '';
  const relayRows = result.rows.filter((row) => row.entrant_type === 'relay');
  const legHistoryByEntrant = new Map<string, Map<string, PriorPerformance[]>>();
  for (const row of relayRows) {
    const athleteIds = (members.get(row.entrant_id) ?? []).map((member) => member.athleteId).filter((id): id is string => id !== null && id !== undefined);
    legHistoryByEntrant.set(row.entrant_id, await relayLegHistory(db, {
      workspaceId: row.workspace_id, code: row.code, athleteIds, excludeSessionId: row.session_id, eventDate,
    }));
  }
  return result.rows.map((row) => {
    const memberRows = row.entrant_type === 'relay' ? members.get(row.entrant_id) ?? [] : [];
    const relayLegs = row.entrant_type === 'relay'
      ? relayLegResults(memberRows, relayEntries.filter((entry) => entry.entrantId === row.entrant_id), selections.get(row.entrant_id) ?? new Map<string, string>(), Number(row.precision))
      : null;
    if (relayLegs && eventDate !== '') {
      const legHistory = legHistoryByEntrant.get(row.entrant_id) ?? new Map<string, PriorPerformance[]>();
      relayLegs.forEach((leg, legIndex) => {
        const athleteId = memberRows[legIndex]?.athleteId ?? null;
        if (athleteId === null || leg.value === null) {
          leg.isPb = false;
          leg.isSb = false;
          return;
        }
        const flags = performanceFlags(leg.value, legHistory.get(athleteId) ?? [], row.direction, eventDate.slice(0, 4));
        leg.isPb = flags.isPb;
        leg.isSb = flags.isSb;
      });
    }
    return {
      entrantId: row.entrant_id,
      name: row.name,
      clubName: row.club_name,
      discipline: row.code,
      disciplineLabel: row.discipline_label,
      finalResult: row.final_result === null ? null : Number(row.final_result),
      outcome: row.outcome,
      unit: row.unit,
      precision: Number(row.precision),
      placing: row.final_place === null ? null : Number(row.final_place),
      relayMembers: row.relay_members,
      ...(relayLegs ? { relayLegs } : {}),
    };
  });
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
  const result = await db.query<{ relay_member_id: string; leg: number; name: string; member_kind: string }>(
    `SELECT rm.id AS relay_member_id, rm.leg, en.name, rm.member_kind
     FROM relay_members rm
     JOIN meet_entrants en ON en.id = rm.member_id AND en.event_id = rm.event_id
     WHERE rm.relay_id = $1 AND rm.event_id = $2
     ORDER BY rm.leg`,
    [relayId, eventId],
  );
  return result.rows.map((row) => ({ relayMemberId: row.relay_member_id, leg: Number(row.leg), name: row.name, isGuest: row.member_kind === 'guest' }));
}

export async function listRegistrations(actor: MeetActor, eventId: string, sessionId: string, db: DbExecutor = getPool()): Promise<SessionRegistration[]> {
  await meetAccess(db, actor, eventId);
  await getSession(db, eventId, sessionId);
  const result = await db.query('SELECT * FROM session_entrants WHERE session_id = $1 ORDER BY created_at, id', [sessionId]);
  return result.rows.map((row) => mapMeetRow<SessionRegistration>(row));
}

export async function registerEntrant(actor: MeetActor, eventId: string, target: SessionTarget, transaction: MeetTransaction = withTransaction): Promise<SessionRegistration> {
  meetCoach(actor);
  meetIds(target.disciplineSessionId, target.entrantId);
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (access.helper) meetNotFound();
    const session = await getSession(db, eventId, target.disciplineSessionId);
    if (session.status !== 'scheduled' || !['scheduled', 'in_progress'].includes(access.event.status)) meetConflict('ROSTER_LOCKED', 'Session registration is closed');
    const entrant = await db.query<{ kind: string; athlete_id: string | null }>('SELECT kind, athlete_id FROM meet_entrants WHERE id = $1 AND event_id = $2 AND workspace_id = $3', [target.entrantId, eventId, actor.workspaceId]);
    if (!entrant.rows[0]) meetNotFound();
    const definition = await getDefinition(db, session.disciplineDefinitionId);
    if ((entrant.rows[0].kind === 'relay') !== (definition.defaultRules.entrantType === 'relay')) meetConflict('ENTRANT_KIND_MISMATCH', 'Entrant type does not match the discipline');
    if (entrant.rows[0].kind === 'athlete') {
      const preferred = await db.query('SELECT 1 FROM athlete_preferred_disciplines WHERE athlete_id = $1 AND discipline_definition_id = $2', [entrant.rows[0].athlete_id, session.disciplineDefinitionId]);
      if (!preferred.rows[0]) meetConflict('ATHLETE_DISCIPLINE_MISMATCH', 'Athlete does not have this discipline selected');
    }
    if (definition.defaultRules.teamSize) {
      const members = await db.query('SELECT id FROM relay_members WHERE relay_id = $1', [target.entrantId]);
      if (members.rows.length !== definition.defaultRules.teamSize) meetConflict('RELAY_SIZE_MISMATCH', 'Relay size does not match the discipline');
      const ineligibleMember = await db.query(
        `SELECT 1
         FROM relay_members rm
         JOIN meet_entrants member ON member.id = rm.member_id AND member.event_id = rm.event_id
         WHERE rm.relay_id = $1
           AND member.kind = 'athlete'
           AND NOT EXISTS (
             SELECT 1 FROM athlete_preferred_disciplines apd
             WHERE apd.athlete_id = member.athlete_id AND apd.discipline_definition_id = $2
           )
         LIMIT 1`,
        [target.entrantId, session.disciplineDefinitionId],
      );
      if (ineligibleMember.rows[0]) meetConflict('ATHLETE_DISCIPLINE_MISMATCH', 'Every relay athlete must have this discipline selected');
    }
    const existing = await db.query('SELECT * FROM session_entrants WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId]);
    if (existing.rows[0]) {
      if (existing.rows[0].withdrawn_at) {
        const restored = await db.query(
          'UPDATE session_entrants SET withdrawn_at = NULL, withdrawn_by = NULL WHERE id = $1 RETURNING *',
          [existing.rows[0].id],
        );
        const registration = mapMeetRow<SessionRegistration>(restored.rows[0]);
        await meetAudit(db, actor, eventId, actor.workspaceId, 'registration', registration.id, 'restored', existing.rows[0], registration);
        return registration;
      }
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
