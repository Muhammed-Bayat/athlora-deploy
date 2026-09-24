import { randomUUID } from 'node:crypto';
import { getPool, type DbExecutor } from '../db/client.js';
import { mapMeetRow } from '../db/meet-row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import type { DisciplineDefinition, MeetActor, SessionEntry, SessionEntryInput, SessionEntryReplacement, SessionOverrideInput, SessionResult, SessionSelectionInput, SessionStatistics, SessionTarget } from '../types/meets.js';
import { canReadEntrant, canWriteEntrant, meetAccess, meetAudit, meetCoach, meetConflict, meetIds, meetNotFound, type MeetAccess } from './meetAccess.js';
import { getDefinition, getSession, type MeetTransaction } from './meets.js';
import { deriveEffectiveResult, deriveFieldBest, deriveTrackTime } from './resultDerivation.js';
import { deriveVertical, verticalPlacings } from './verticalScoring.js';
import { VERTICAL_PERFORMANCES, verticalRecords } from './verticalStatistics.js';

async function registration(db: DbExecutor, actor: MeetActor, access: MeetAccess, eventId: string, target: SessionTarget, write: boolean) {
  meetIds(target.disciplineSessionId, target.entrantId);
  const result = await db.query<{ workspace_id: string; withdrawn_at: Date | null }>(
    `SELECT workspace_id, withdrawn_at FROM session_entrants WHERE event_id = $1 AND session_id = $2 AND entrant_id = $3`,
    [eventId, target.disciplineSessionId, target.entrantId],
  );
  const row = result.rows[0];
  if (!row || !(write ? canWriteEntrant : canReadEntrant)(actor, access, row.workspace_id)) meetNotFound();
  if (write && row.withdrawn_at) meetConflict('ENTRANT_WITHDRAWN', 'Registration has been withdrawn');
  return row;
}

async function loggingTarget(db: DbExecutor, actor: MeetActor, eventId: string, target: SessionTarget) {
  const access = await meetAccess(db, actor, eventId, true);
  const session = await getSession(db, eventId, target.disciplineSessionId);
  const entrant = await registration(db, actor, access, eventId, target, true);
  if (access.event.status !== 'in_progress' || session.status !== 'in_progress') meetConflict('SESSION_NOT_IN_PROGRESS', 'Event and discipline session must be in progress');
  const definition = await getDefinition(db, session.disciplineDefinitionId);
  return { access, session, entrant, definition };
}

function validateDisciplineEntry(input: SessionEntryInput, definition: DisciplineDefinition): void {
  if (definition.kind !== 'vertical' && input.verticalState) throw new ApiError(400, 'VALIDATION_ERROR', 'Vertical state requires a vertical discipline');
  if (definition.kind === 'vertical' && (['split', 'penalty'].includes(input.entryType) || (input.entryType !== 'attempt' && input.verticalState))) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid vertical entry type');
  if ((input.unit !== null && input.unit !== definition.unit) || (input.isFoul && definition.direction === 'lower')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Entry does not match the discipline unit or foul rules');
  }
}

async function recompute(db: DbExecutor, actor: MeetActor, eventId: string, target: SessionTarget, workspaceId: string, definition: DisciplineDefinition, eventType: MeetAccess['event']['type']): Promise<void> {
  const rows = await db.query('SELECT * FROM session_timeline_entries WHERE session_id = $1 AND entrant_id = $2 ORDER BY created_at, id', [target.disciplineSessionId, target.entrantId]);
  const entries = rows.rows.map((row) => mapMeetRow<SessionEntry>(row));
  const session = definition.kind === 'vertical' ? await getSession(db, eventId, target.disciplineSessionId) : null;
  const prior = (await db.query<{ selected_entry_id: string | null }>('SELECT selected_entry_id FROM session_results WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId])).rows[0];
  const selectedEntryId = prior?.selected_entry_id ?? null;
  const stillSelected = selectedEntryId && entries.some((entry) => entry.id === selectedEntryId && !entry.deletedAt) ? selectedEntryId : null;
  const derived = definition.kind === 'vertical'
    ? deriveVertical(entries, session!.verticalConfig!)
    : definition.defaultRules.aggregation === 'timed'
      ? deriveTrackTime(entries, eventType, stillSelected)
      : deriveFieldBest(entries);
  const before = await db.query('SELECT * FROM session_results WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId]);
  const after = await db.query(
    `INSERT INTO session_results (event_id, session_id, entrant_id, workspace_id, outcome, final_result, unit, selected_entry_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (session_id, entrant_id) DO UPDATE
       SET outcome = EXCLUDED.outcome, final_result = EXCLUDED.final_result, unit = EXCLUDED.unit,
           selected_entry_id = EXCLUDED.selected_entry_id,
           version = session_results.version + 1, updated_at = now() RETURNING *`,
    [eventId, target.disciplineSessionId, target.entrantId, workspaceId, derived.outcome, derived.value, definition.unit, stillSelected],
  );
  await meetAudit(db, actor, eventId, workspaceId, 'result', after.rows[0].id, before.rows[0] ? 'recomputed' : 'created', before.rows[0], after.rows[0]);
}

export async function listSessionEntries(actor: MeetActor, eventId: string, sessionId: string, entrantId?: string, db: DbExecutor = getPool()): Promise<SessionEntry[]> {
  const access = await meetAccess(db, actor, eventId);
  await getSession(db, eventId, sessionId);
  if (entrantId !== undefined) await registration(db, actor, access, eventId, { disciplineSessionId: sessionId, entrantId }, false);
  const result = await db.query(
    `SELECT * FROM session_timeline_entries WHERE session_id = $1 AND deleted_at IS NULL
       AND ($2::uuid IS NULL OR entrant_id = $2) AND ($3::boolean OR workspace_id = $4)
     ORDER BY created_at, id`, [sessionId, entrantId ?? null, access.host || access.helper, 'workspaceId' in actor ? actor.workspaceId : null],
  );
  return result.rows.map((row) => mapMeetRow<SessionEntry>(row));
}

export async function createSessionEntry(actor: MeetActor, eventId: string, target: SessionTarget, input: SessionEntryInput, transaction: MeetTransaction = withTransaction, entryId: string = randomUUID()): Promise<SessionEntry> {
  meetIds(entryId);
  return transaction(async (db) => {
    const { access, entrant, definition } = await loggingTarget(db, actor, eventId, target);
    validateDisciplineEntry(input, definition);
    const order = definition.kind === 'vertical' ? await db.query<{ next: number }>('SELECT COALESCE(MAX(attempt_order), 0) + 1 AS next FROM session_timeline_entries WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId]) : null;
    const result = await db.query(
      `INSERT INTO session_timeline_entries
         (id, event_id, session_id, entrant_id, workspace_id, entry_type, value, unit, is_foul, incident_type, note_text, device_id, recorded_by, public_logger_session_id, vertical_state, attempt_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [entryId, eventId, target.disciplineSessionId, target.entrantId, entrant.workspace_id, input.entryType, input.value,
        input.unit, input.isFoul, input.incidentType, input.noteText, input.deviceId,
         'userId' in actor ? actor.userId : null, 'publicLoggerSessionId' in actor ? actor.publicLoggerSessionId : null, input.verticalState ?? null, order?.rows[0].next ?? null],
    );
    const entry = mapMeetRow<SessionEntry>(result.rows[0]);
    await meetAudit(db, actor, eventId, entrant.workspace_id, 'entry', entry.id, 'created', null, entry);
    await recompute(db, actor, eventId, target, entrant.workspace_id, definition, access.event.type);
    return entry;
  });
}

function assertEntryCorrection(actor: MeetActor, access: MeetAccess, entry: SessionEntry): void {
  if ('publicLoggerSessionId' in actor) {
    if (actor.publicLoggerSessionId !== entry.publicLoggerSessionId) meetNotFound();
  } else {
    meetCoach(actor);
    if (access.helper && entry.recordedBy !== actor.userId) meetNotFound();
  }
}

export async function mutateSessionEntry(
  actor: MeetActor, eventId: string, target: SessionTarget, entryId: string,
  input: SessionEntryReplacement | { expectedVersion: number }, undo: boolean,
  transaction: MeetTransaction = withTransaction,
): Promise<SessionEntry> {
  meetIds(entryId);
  return transaction(async (db) => {
    const { access, entrant, definition } = await loggingTarget(db, actor, eventId, target);
    const found = await db.query('SELECT * FROM session_timeline_entries WHERE id = $1 AND event_id = $2 AND session_id = $3 AND entrant_id = $4 FOR UPDATE', [entryId, eventId, target.disciplineSessionId, target.entrantId]);
    if (!found.rows[0]) meetNotFound();
    const before = mapMeetRow<SessionEntry>(found.rows[0]);
    assertEntryCorrection(actor, access, before);
    if (undo && before.deletedAt && before.version === input.expectedVersion + 1) return before;
    if (before.deletedAt) meetNotFound();
    if (before.version !== input.expectedVersion) meetConflict('TIMELINE_ENTRY_VERSION_CONFLICT', 'Timeline entry has been modified');
    let after: SessionEntry;
    if (undo) {
      const result = await db.query('UPDATE session_timeline_entries SET deleted_at = now(), updated_at = now(), version = version + 1 WHERE id = $1 RETURNING *', [entryId]);
      after = mapMeetRow<SessionEntry>(result.rows[0]);
    } else {
      if (!('entryType' in input)) throw new Error('Missing replacement entry');
      validateDisciplineEntry(input, definition);
      const result = await db.query(
        `UPDATE session_timeline_entries SET entry_type = $1, value = $2, unit = $3, is_foul = $4,
          incident_type = $5, note_text = $6, device_id = $7, vertical_state = $9, version = version + 1, updated_at = now() WHERE id = $8 RETURNING *`,
         [input.entryType, input.value, input.unit, input.isFoul, input.incidentType, input.noteText, input.deviceId, entryId, input.verticalState ?? null],
      );
      after = mapMeetRow<SessionEntry>(result.rows[0]);
    }
    await meetAudit(db, actor, eventId, entrant.workspace_id, 'entry', entryId, undo ? 'undone' : 'corrected', before, after);
    await recompute(db, actor, eventId, target, entrant.workspace_id, definition, access.event.type);
    return after;
  });
}

export async function listSessionResults(actor: MeetActor, eventId: string, sessionId: string, db: DbExecutor = getPool()): Promise<SessionResult[]> {
  const access = await meetAccess(db, actor, eventId);
  const session = await getSession(db, eventId, sessionId);
  const definition = await getDefinition(db, session.disciplineDefinitionId);
  const verticalEntries = definition.kind === 'vertical' ? (await db.query('SELECT * FROM session_timeline_entries WHERE session_id = $1 ORDER BY attempt_order', [sessionId])).rows.map(row => mapMeetRow<SessionEntry>(row)) : [];
  const result = await db.query(
    `SELECT r.*, se.withdrawn_at FROM session_results r JOIN session_entrants se
       ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
     WHERE r.session_id = $1 ORDER BY r.entrant_id`, [sessionId],
  );
  // Rank the whole session, then filter visibility; guest ranks must not change with the viewer.
  const rows = result.rows.map((row) => {
    const mapped = mapMeetRow<SessionResult>(row);
    const vertical = definition.kind === 'vertical' ? deriveVertical(verticalEntries.filter(entry => entry.entrantId === mapped.entrantId), session.verticalConfig!) : undefined;
    const effective = vertical ?? deriveEffectiveResult({ value: mapped.finalResult, outcome: mapped.outcome, incident: null }, mapped.manualOverride);
    const eligible = access.event.status !== 'cancelled' && session.status !== 'cancelled' && row.withdrawn_at === null;
    return { ...mapped, ...(vertical ? { vertical } : {}), effectiveResult: effective.value, effectiveOutcome: effective.outcome,
      countsTowardsStatistics: eligible && effective.outcome === 'valid' && (definition.kind !== 'vertical' || session.status === 'completed'), placing: null as number | null };
  });
  const ranked = rows.filter((row) => row.countsTowardsStatistics && row.effectiveResult !== null);
  if (definition.kind === 'vertical') {
    const places = verticalPlacings(ranked.map(row => ({ entrantId: row.entrantId, score: { ...row.vertical!, value: row.effectiveResult, outcome: row.effectiveOutcome, incident: null } })));
    ranked.forEach(row => { row.placing = places.get(row.entrantId) ?? null; });
  } else {
    ranked.sort((a, b) => (a.effectiveResult! - b.effectiveResult!) * (definition.direction === 'lower' ? 1 : -1));
    ranked.forEach((row, index) => { row.placing = index > 0 && ranked[index - 1].effectiveResult === row.effectiveResult ? ranked[index - 1].placing : index + 1; });
  }
  if (definition.kind === 'vertical') {
    for (const row of rows) {
      const history = await db.query<{ final_result: string; event_date: string }>(`WITH performances AS (${VERTICAL_PERFORMANCES})
        SELECT final_result, to_char(event_date, 'YYYY-MM-DD') AS event_date FROM performances
        WHERE workspace_id = $1 AND code = $2 AND athlete_id = (SELECT athlete_id FROM meet_entrants WHERE id = $3) AND session_id <> $4`, [row.workspaceId, definition.code, row.entrantId, sessionId]);
      const date = await db.query<{ date: string; athlete_id: string | null }>("SELECT to_char(e.date, 'YYYY-MM-DD') AS date, en.athlete_id FROM events e JOIN meet_entrants en ON en.event_id = e.id WHERE e.id = $1 AND en.id = $2", [eventId, row.entrantId]);
      Object.assign(row, verticalRecords(row.effectiveResult, row.countsTowardsStatistics && !!date.rows[0]?.athlete_id, date.rows[0]?.date ?? '', history.rows.map(h => ({ value: Number(h.final_result), date: h.event_date }))));
    }
  }
  return rows.filter((row) => canReadEntrant(actor, access, row.workspaceId)).map(({ ...row }) => {
    // Do not expose joined registration internals as accidental DTO fields.
    delete (row as unknown as Record<string, unknown>).withdrawnAt;
    return row;
  });
}

export async function overrideSessionResult(actor: MeetActor, eventId: string, target: SessionTarget, input: SessionOverrideInput, transaction: MeetTransaction = withTransaction): Promise<void> {
  meetCoach(actor);
  await transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (access.helper) meetNotFound();
    const session = await getSession(db, eventId, target.disciplineSessionId);
    if ((await getDefinition(db, session.disciplineDefinitionId)).kind === 'vertical') meetConflict('DERIVED_RESULT_ONLY', 'Correct the attempt history to change a vertical result');
    const entrant = await registration(db, actor, access, eventId, target, false);
    const found = await db.query('SELECT * FROM session_results WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId]);
    const before = found.rows[0];
    if (!before) meetNotFound();
    if (before.version !== input.expectedVersion) meetConflict('RESULT_VERSION_CONFLICT', 'Result has been modified');
    const result = await db.query(
      `UPDATE session_results SET manual_override = $1, override_reason = $2, overridden_by = $3,
       override_at = CASE WHEN $1::numeric IS NULL THEN NULL ELSE now() END, version = version + 1, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [input.manualOverride, input.overrideReason, input.manualOverride === null ? null : actor.userId, before.id],
    );
    await meetAudit(db, actor, eventId, entrant.workspace_id, 'result', before.id, 'overridden', before, result.rows[0]);
  });
}

export async function selectSessionResultEntry(actor: MeetActor, eventId: string, target: SessionTarget, input: SessionSelectionInput, transaction: MeetTransaction = withTransaction): Promise<SessionResult> {
  meetCoach(actor);
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (access.helper) meetNotFound();
    const session = await getSession(db, eventId, target.disciplineSessionId);
    const definition = await getDefinition(db, session.disciplineDefinitionId);
    if (definition.kind === 'vertical') meetConflict('DERIVED_RESULT_ONLY', 'Vertical results are derived from attempt history');
    const entrant = await registration(db, actor, access, eventId, target, false);
    const found = await db.query('SELECT * FROM session_results WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId]);
    const before = found.rows[0];
    if (!before) meetNotFound();
    if (before.version !== input.expectedVersion) meetConflict('RESULT_VERSION_CONFLICT', 'Result has been modified');
    if (input.entryId) {
      meetIds(input.entryId);
      const entry = await db.query(
        `SELECT 1 FROM session_timeline_entries
         WHERE id = $1 AND session_id = $2 AND entrant_id = $3 AND deleted_at IS NULL
           AND entry_type = 'attempt' AND value IS NOT NULL`,
        [input.entryId, target.disciplineSessionId, target.entrantId],
      );
      if (!entry.rows[0]) meetNotFound();
    }
    await db.query(
      `UPDATE session_results SET selected_entry_id = $1, updated_at = now() WHERE id = $2`,
      [input.entryId, before.id],
    );
    await recompute(db, actor, eventId, target, entrant.workspace_id, definition, access.event.type);
    const after = (await db.query('SELECT * FROM session_results WHERE id = $1', [before.id])).rows[0];
    await meetAudit(db, actor, eventId, entrant.workspace_id, 'result', before.id, input.entryId ? 'entry_selected' : 'entry_selection_cleared', before, after);
    const board = await listSessionResults(actor, eventId, target.disciplineSessionId, db);
    return board.find((row) => row.entrantId === target.entrantId)!;
  });
}

export async function sessionStatistics(actor: MeetActor, eventId: string, sessionId: string, entrantId?: string, db: DbExecutor = getPool()): Promise<SessionStatistics> {
  const access = await meetAccess(db, actor, eventId);
  const session = await getSession(db, eventId, sessionId);
  if (entrantId !== undefined) await registration(db, actor, access, eventId, { disciplineSessionId: sessionId, entrantId }, false);
  const definition = await getDefinition(db, session.disciplineDefinitionId);
  const results = (await listSessionResults(actor, eventId, sessionId, db)).filter((row) => entrantId === undefined || row.entrantId === entrantId);
  const valid = results.filter((row) => row.countsTowardsStatistics && row.effectiveResult !== null);
  const values = valid.map((row) => row.effectiveResult!);
  return { disciplineSessionId: sessionId, entrantId: entrantId ?? null, disciplineDefinitionId: definition.id,
    unit: definition.unit, direction: definition.direction, resultCount: results.length,
    validResultCount: valid.length, best: values.length ? (definition.direction === 'lower' ? Math.min(...values) : Math.max(...values)) : null };
}
