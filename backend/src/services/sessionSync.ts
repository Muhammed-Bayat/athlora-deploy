import type { DbExecutor } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import { notifySessionInvalidated } from '../realtime/index.js';
import type { MeetActor, SessionTarget } from '../types/meets.js';
import { object, parseSessionEntry, parseSessionEntryReplacement, parseSessionTarget, parseVersion } from '../validation/meets.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { meetAccess, meetIds, meetNotFound } from './meetAccess.js';
import type { MeetTransaction } from './meets.js';
import { assertPublicSessionEntryContent, createSessionEntry, mutateSessionEntry } from './sessionPerformances.js';

export interface SessionSyncAction {
  actionId: string;
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  target: SessionTarget;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  clientTimestamp: string;
}
export interface SessionSyncReceipt {
  actionId: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  target: SessionTarget;
  entryId?: string;
  serverVersion?: number;
  code?: string;
}

export function parseSessionSyncActions(value: unknown): SessionSyncAction[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new ApiError(400, 'VALIDATION_ERROR', 'Expected 1 to 50 session actions');
  return value.map((raw) => {
    const action = object(raw, ['actionId', 'actionType', 'target', 'payload', 'expectedVersion', 'clientTimestamp']);
    if (!isCanonicalUuid(action.actionId) || !['create_entry', 'edit_entry', 'undo_entry'].includes(action.actionType as string)
      || typeof action.clientTimestamp !== 'string' || Number.isNaN(Date.parse(action.clientTimestamp))
      || !action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session sync action');
    }
    return { actionId: action.actionId, actionType: action.actionType as SessionSyncAction['actionType'],
      target: parseSessionTarget(action.target), payload: action.payload as Record<string, unknown>,
      ...(action.expectedVersion === undefined ? {} : { expectedVersion: parseVersion(action.expectedVersion) }), clientTimestamp: action.clientTimestamp };
  });
}

/** New-target batches use the same mutation boundary as HTTP, never raw unscoped writes. */
export async function processSessionSyncBatch(actor: MeetActor, eventId: string, deviceId: string, input: unknown, transaction: MeetTransaction = withTransaction) {
  meetIds(eventId);
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 200) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid deviceId');
  const actions = parseSessionSyncActions(input);
  const result = await transaction(async (db) => {
    await meetAccess(db, actor, eventId, true);
    const isPublic = 'publicLoggerSessionId' in actor;
    const table = isPublic ? 'public_sync_action_receipts' : 'sync_action_receipts';
    const actorColumn = isPublic ? 'session_id' : 'actor_id';
    const actorId = isPublic ? actor.publicLoggerSessionId : actor.userId;
    const receipts: SessionSyncReceipt[] = [];
    for (const action of actions) {
      // Serialize receipt insertion, including simultaneous retries on different events.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`session-sync:${table}:${action.actionId}`]);
      const previous = await db.query(`SELECT * FROM ${table} WHERE action_id = $1`, [action.actionId]);
      const prior = previous.rows[0];
      if (prior) {
        if (prior.event_id !== eventId || prior[actorColumn] !== actorId || prior.device_id !== deviceId
          || prior.discipline_session_id !== action.target.disciplineSessionId || prior.entrant_id !== action.target.entrantId
          || prior.action_type !== action.actionType) {
          receipts.push({ actionId: action.actionId, target: action.target, status: 'rejected', code: 'NOT_FOUND' });
        } else receipts.push({ actionId: action.actionId, target: action.target,
          status: prior.status === 'rejected' ? 'rejected' : 'duplicate',
          ...(prior.entry_id ? { entryId: prior.entry_id, serverVersion: prior.server_version } : { code: prior.error_code }) });
        continue;
      }
      await db.query('SAVEPOINT session_action');
      try {
        const inTransaction: MeetTransaction = (operation) => operation(db);
        let entry;
        if (action.actionType === 'create_entry') {
          const input = parseSessionEntry({ ...action.payload, deviceId });
          if (isPublic) assertPublicSessionEntryContent(input);
          entry = await createSessionEntry(actor, eventId, action.target, input, inTransaction, action.actionId);
        } else {
          const { entryId, ...payload } = action.payload;
          meetIds(entryId);
          let expectedVersion = parseVersion(action.expectedVersion ?? payload.expectedVersion);
          if (isPublic) {
            // Public officials retain audited last-write-wins, but only for their own exact target.
            const current = await db.query(
              `SELECT * FROM session_timeline_entries WHERE id = $1 AND event_id = $2 AND session_id = $3 AND entrant_id = $4 AND public_logger_session_id = $5 AND deleted_at IS NULL`,
              [entryId, eventId, action.target.disciplineSessionId, action.target.entrantId, actorId],
            );
            const row = current.rows[0];
            if (!row) meetNotFound();
            if (row.version !== expectedVersion) {
              await db.query(
                `INSERT INTO public_sync_conflict_log (action_id, session_id, event_id, entry_id, overwritten_version, overwritten_value, overwritten_incident, overwritten_note, winning_action_id, discipline_session_id, entrant_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$1,$9,$10)`,
                [action.actionId, actorId, eventId, entryId, row.version, row.value, row.incident_type, row.note_text, action.target.disciplineSessionId, action.target.entrantId],
              );
              await db.query(
                `INSERT INTO offline_sync_conflicts
                  (event_id, discipline_session_id, entrant_id, entry_id, public_logger_session_id, device_id, action_id, action_type, expected_version, actual_version, attempted_payload, canonical_state, client_timestamp)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [eventId, action.target.disciplineSessionId, action.target.entrantId, entryId, actorId, deviceId,
                  action.actionId, action.actionType, expectedVersion, row.version, JSON.stringify(action.payload), JSON.stringify(row), action.clientTimestamp],
              );
              expectedVersion = row.version;
            }
          }
          if (action.actionType === 'undo_entry') object(payload, ['expectedVersion']);
          if (action.actionType === 'undo_entry') {
            entry = await mutateSessionEntry(actor, eventId, action.target, entryId as string, { expectedVersion }, true, inTransaction);
          } else {
            const input = parseSessionEntryReplacement({ ...payload, deviceId, expectedVersion });
            if (isPublic) assertPublicSessionEntryContent(input);
            entry = await mutateSessionEntry(actor, eventId, action.target, entryId as string, input, false, inTransaction);
          }
        }
        await saveReceipt(db, table, actorColumn, actorId, eventId, deviceId, action, entry.id, entry.version, null);
        receipts.push({ actionId: action.actionId, target: action.target, status: 'accepted', entryId: entry.id, serverVersion: entry.version });
        await db.query('RELEASE SAVEPOINT session_action');
      } catch (error) {
        await db.query('ROLLBACK TO SAVEPOINT session_action');
        if (!(error instanceof ApiError) && !(typeof error === 'object' && error !== null && 'code' in error && ['23503', '23505', '23514'].includes(String(error.code)))) throw error;
        const code = error instanceof ApiError ? error.code : 'VALIDATION_ERROR';
        if (code === 'TIMELINE_ENTRY_VERSION_CONFLICT') {
          const entryId = typeof action.payload.entryId === 'string' ? action.payload.entryId : null;
          const canonical = entryId
            ? await db.query('SELECT * FROM session_timeline_entries WHERE id = $1 AND event_id = $2 AND session_id = $3 AND entrant_id = $4', [entryId, eventId, action.target.disciplineSessionId, action.target.entrantId])
            : { rows: [] as Record<string, unknown>[] };
          await db.query(
            `INSERT INTO offline_sync_conflicts
              (event_id, discipline_session_id, entrant_id, entry_id, actor_id, public_logger_session_id, device_id, action_id, action_type, expected_version, actual_version, attempted_payload, canonical_state, client_timestamp)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [eventId, action.target.disciplineSessionId, action.target.entrantId, entryId,
              isPublic ? null : actor.userId, isPublic ? actor.publicLoggerSessionId : null, deviceId,
              action.actionId, action.actionType, action.expectedVersion ?? action.payload.expectedVersion ?? null,
              canonical.rows[0]?.version ?? null, JSON.stringify(action.payload), canonical.rows[0] ? JSON.stringify(canonical.rows[0]) : null, action.clientTimestamp],
          );
        }
        // Invalid references cannot become FK-backed receipts. Valid targets retain rejected receipts.
        const target = await db.query('SELECT 1 FROM session_entrants WHERE event_id = $1 AND session_id = $2 AND entrant_id = $3', [eventId, action.target.disciplineSessionId, action.target.entrantId]);
        if (target.rows.length && code !== 'NOT_FOUND') await saveReceipt(db, table, actorColumn, actorId, eventId, deviceId, action, null, null, code);
        receipts.push({ actionId: action.actionId, target: action.target, status: 'rejected', code });
        await db.query('RELEASE SAVEPOINT session_action');
      }
    }
    return { receipts, recomputedResults: receipts.some((receipt) => receipt.status === 'accepted') };
  });
  for (const receipt of result.receipts) {
    if (receipt.status === 'accepted') notifySessionInvalidated(eventId, receipt.target.disciplineSessionId, receipt.target.entrantId);
  }
  return result;
}

async function saveReceipt(db: DbExecutor, table: string, actorColumn: string, actorId: string, eventId: string, deviceId: string, action: SessionSyncAction, entryId: string | null, version: number | null, code: string | null): Promise<void> {
  await db.query(
    `INSERT INTO ${table} (action_id, event_id, ${actorColumn}, device_id, action_type, status, entry_id, server_version, error_code, discipline_session_id, entrant_id, client_timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [action.actionId, eventId, actorId, deviceId, action.actionType, code ? 'rejected' : 'accepted', entryId, version, code, action.target.disciplineSessionId, action.target.entrantId, action.clientTimestamp],
  );
}
