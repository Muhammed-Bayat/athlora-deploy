import { getPool, type DbExecutor } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import { meetAccess, meetCoach, meetIds, meetNotFound } from './meetAccess.js';
import { getSession, type MeetTransaction } from './meets.js';
import type { MeetActor } from '../types/meets.js';

export interface OfflineConflict {
  id: string;
  entryId: string | null;
  entrantId: string | null;
  deviceId: string;
  actionId: string;
  actionType: string;
  expectedVersion: number | null;
  actualVersion: number | null;
  attemptedPayload: Record<string, unknown>;
  canonicalState: Record<string, unknown> | null;
  clientTimestamp: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
}

function mapConflict(row: Record<string, unknown>): OfflineConflict {
  return {
    id: String(row.id), entryId: row.entry_id as string | null, entrantId: row.entrant_id as string | null,
    deviceId: String(row.device_id), actionId: String(row.action_id), actionType: String(row.action_type),
    expectedVersion: row.expected_version === null ? null : Number(row.expected_version),
    actualVersion: row.actual_version === null ? null : Number(row.actual_version),
    attemptedPayload: (row.attempted_payload as Record<string, unknown>) ?? {},
    canonicalState: row.canonical_state as Record<string, unknown> | null,
    clientTimestamp: row.client_timestamp as string | null, createdAt: String(row.created_at),
    resolvedAt: row.resolved_at as string | null, resolutionReason: row.resolution_reason as string | null,
  };
}

/** Coach-only cross-device evidence for choosing the existing official session entry. */
export async function getSessionResolution(actor: MeetActor, eventId: string, sessionId: string, db: DbExecutor = getPool()) {
  meetCoach(actor);
  const access = await meetAccess(db, actor, eventId);
  if (!access.host) meetNotFound();
  await getSession(db, eventId, sessionId);
  const [conflicts, audit] = await Promise.all([
    db.query('SELECT * FROM offline_sync_conflicts WHERE event_id = $1 AND discipline_session_id = $2 ORDER BY created_at, id', [eventId, sessionId]),
    db.query(`SELECT * FROM meet_domain_audit WHERE event_id = $1
      AND (entity_id = $2 OR entity_id IN (SELECT id FROM session_timeline_entries WHERE session_id = $2))
      ORDER BY created_at, id`, [eventId, sessionId]),
  ]);
  return {
    conflicts: conflicts.rows.map(mapConflict),
    audit: audit.rows.map((row) => ({
      id: row.id, entityType: row.entity_type, entityId: row.entity_id, action: row.action,
      actorId: row.actor_id, publicLoggerSessionId: row.public_logger_session_id,
      beforeState: row.before_state, afterState: row.after_state, createdAt: row.created_at,
    })),
  };
}

export async function resolveOfflineConflict(actor: MeetActor, eventId: string, sessionId: string, conflictId: string, reason: string, transaction: MeetTransaction = withTransaction): Promise<OfflineConflict> {
  meetCoach(actor);
  meetIds(conflictId);
  if (!reason.trim() || reason.trim().length > 500) throw new ApiError(400, 'VALIDATION_ERROR', 'Resolution reason must be between 1 and 500 characters');
  return transaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (!access.host) meetNotFound();
    await getSession(db, eventId, sessionId);
    const result = await db.query(
      `UPDATE offline_sync_conflicts SET resolved_at = now(), resolved_by = $1, resolution_reason = $2
       WHERE id = $3 AND event_id = $4 AND discipline_session_id = $5 AND resolved_at IS NULL RETURNING *`,
      [actor.userId, reason.trim(), conflictId, eventId, sessionId],
    );
    if (!result.rows[0]) meetNotFound();
    return mapConflict(result.rows[0]);
  });
}
