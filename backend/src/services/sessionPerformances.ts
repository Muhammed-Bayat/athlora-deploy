import { randomUUID } from 'node:crypto';
import { getPool, type DbExecutor } from '../db/client.js';
import { mapMeetRow } from '../db/meet-row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import type { DisciplineDefinition, MeetActor, SessionEntry, SessionEntryInput, SessionEntryReplacement, SessionOverrideInput, SessionResult, SessionStatistics, SessionTarget } from '../types/meets.js';
import { canReadEntrant, canWriteEntrant, meetAccess, meetAudit, meetCoach, meetConflict, meetIds, meetNotFound, type MeetAccess } from './meetAccess.js';
import { getDefinition, getSession, type MeetTransaction } from './meets.js';
import { deriveEffectiveResult, deriveFieldBest, deriveTrackTime } from './resultDerivation.js';

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
  if ((input.unit !== null && input.unit !== definition.unit) || (input.isFoul && definition.direction === 'lower')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Entry does not match the discipline unit or foul rules');
  }
}

async function recompute(db: DbExecutor, actor: MeetActor, eventId: string, target: SessionTarget, workspaceId: string, definition: DisciplineDefinition, eventType: MeetAccess['event']['type']): Promise<void> {
  const rows = await db.query('SELECT * FROM session_timeline_entries WHERE session_id = $1 AND entrant_id = $2 ORDER BY created_at, id', [target.disciplineSessionId, target.entrantId]);
  const entries = rows.rows.map((row) => mapMeetRow<SessionEntry>(row));
  const derived = definition.defaultRules.aggregation === 'timed' ? deriveTrackTime(entries, eventType) : deriveFieldBest(entries);
  const before = await db.query('SELECT * FROM session_results WHERE session_id = $1 AND entrant_id = $2', [target.disciplineSessionId, target.entrantId]);
  const after = await db.query(
    `INSERT INTO session_results (event_id, session_id, entrant_id, workspace_id, outcome, final_result, unit)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (session_id, entrant_id) DO UPDATE
       SET outcome = EXCLUDED.outcome, final_result = EXCLUDED.final_result, unit = EXCLUDED.unit,
           version = session_results.version + 1, updated_at = now() RETURNING *`,
    [eventId, target.disciplineSessionId, target.entrantId, workspaceId, derived.outcome, derived.value, definition.unit],
  );
  await meetAudit(db, actor, eventId, workspaceId, 'result', after.rows[0].id, 'recomputed', before.rows[0], after.rows[0]);
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
    const result = await db.query(
      `INSERT INTO session_timeline_entries
        (id, event_id, session_id, entrant_id, workspace_id, entry_type, value, unit, is_foul, incident_type, note_text, device_id, recorded_by, public_logger_session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [entryId, eventId, target.disciplineSessionId, target.entrantId, entrant.workspace_id, input.entryType, input.value,
        input.unit, input.isFoul, input.incidentType, input.noteText, input.deviceId,
        'userId' in actor ? actor.userId : null, 'publicLoggerSessionId' in actor ? actor.publicLoggerSessionId : null],
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
         incident_type = $5, note_text = $6, device_id = $7, version = version + 1, updated_at = now() WHERE id = $8 RETURNING *`,
        [input.entryType, input.value, input.unit, input.isFoul, input.incidentType, input.noteText, input.deviceId, entryId],
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
  const result = await db.query(
    `SELECT r.*, se.withdrawn_at FROM session_results r JOIN session_entrants se
       ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
     WHERE r.session_id = $1 ORDER BY r.entrant_id`, [sessionId],
  );
  // Rank the whole session, then filter visibility; guest ranks must not change with the viewer.
  const rows = result.rows.map((row) => {
    const mapped = mapMeetRow<SessionResult>(row);
    const effective = deriveEffectiveResult({ value: mapped.finalResult, outcome: mapped.outcome, incident: null }, mapped.manualOverride);
    const eligible = access.event.status !== 'cancelled' && session.status !== 'cancelled' && row.withdrawn_at === null;
    return { ...mapped, effectiveResult: effective.value, effectiveOutcome: effective.outcome,
      countsTowardsStatistics: eligible && effective.outcome === 'valid', placing: null as number | null };
  });
  const ranked = rows.filter((row) => row.countsTowardsStatistics && row.effectiveResult !== null)
    .sort((a, b) => (a.effectiveResult! - b.effectiveResult!) * (definition.direction === 'lower' ? 1 : -1));
  ranked.forEach((row, index) => { row.placing = index > 0 && ranked[index - 1].effectiveResult === row.effectiveResult ? ranked[index - 1].placing : index + 1; });
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
    await getSession(db, eventId, target.disciplineSessionId);
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
