import type { DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { EventStatus, EventType } from '../types/domain.js';
import type { MeetActor } from '../types/meets.js';
import { isCanonicalUuid } from '../validation/primitives.js';

export function meetNotFound(): never {
  throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

export function meetIds(...ids: unknown[]): void {
  if (!ids.every(isCanonicalUuid)) meetNotFound();
}

export function meetConflict(code: string, message: string): never {
  throw new ApiError(409, code, message);
}

export function meetCoach(actor: MeetActor): asserts actor is Extract<MeetActor, { userId: string }> {
  if (!('userId' in actor) || actor.role !== 'coach') {
    throw new ApiError(403, 'WORKSPACE_CAPABILITY_DENIED', 'Coach access is required');
  }
}

export interface MeetAccess {
  event: { id: string; workspace_id: string; type: EventType; status: EventStatus };
  host: boolean;
  helper: boolean;
}

/** Every mutation locks the parent first, matching legacy event mutations. */
export async function meetAccess(db: DbExecutor, actor: MeetActor, eventId: string, lock = false): Promise<MeetAccess> {
  meetIds(eventId);
  if ('publicLoggerSessionId' in actor) {
    meetIds(actor.publicLoggerSessionId);
    const result = await db.query<MeetAccess['event']>(
      `SELECT e.id, e.workspace_id, e.type, e.status FROM events e
       JOIN public_logger_sessions ps ON ps.event_id = e.id
       JOIN public_logger_links pl ON pl.id = ps.link_id AND pl.event_id = e.id
       WHERE e.id = $1 AND ps.id = $2 AND ps.expires_at > now() AND pl.status = 'active'
         AND e.status IN ('scheduled', 'in_progress') ${lock ? 'FOR UPDATE OF e, ps, pl' : ''}`,
      [eventId, actor.publicLoggerSessionId],
    );
    if (!result.rows[0]) meetNotFound();
    return { event: result.rows[0], host: false, helper: true };
  }
  meetIds(actor.userId, actor.workspaceId);
  const result = await db.query<MeetAccess['event'] & { accepted: boolean; helper: boolean }>(
    `SELECT e.id, e.workspace_id, e.type, e.status,
      EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id
        AND fw.workspace_id = $2 AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision) AS accepted,
      EXISTS (SELECT 1 FROM event_helper_grants hg JOIN users u ON u.auth0_id = hg.auth0_sub
        WHERE hg.event_id = e.id AND u.id = $3 AND hg.status = 'active'
        AND (e.status NOT IN ('completed', 'cancelled') OR e.updated_at >= now() - interval '2 hours')) AS helper
     FROM events e WHERE e.id = $1 ${lock ? 'FOR UPDATE OF e' : ''}`,
    [eventId, actor.workspaceId, actor.userId],
  );
  const event = result.rows[0];
  if (!event || (event.workspace_id !== actor.workspaceId && !event.accepted && !event.helper)) meetNotFound();
  return { event, host: event.workspace_id === actor.workspaceId, helper: event.helper && !event.accepted && event.workspace_id !== actor.workspaceId };
}

export function canReadEntrant(actor: MeetActor, access: MeetAccess, workspaceId: string): boolean {
  return access.host || access.helper || ('workspaceId' in actor && actor.workspaceId === workspaceId);
}

export function canWriteEntrant(actor: MeetActor, access: MeetAccess, workspaceId: string): boolean {
  return access.helper || ('workspaceId' in actor && actor.workspaceId === workspaceId);
}

export async function meetAudit(
  db: DbExecutor, actor: MeetActor, eventId: string, workspaceId: string,
  entityType: string, entityId: string, action: string, before: unknown, after: unknown,
): Promise<void> {
  await db.query(
    `INSERT INTO meet_domain_audit
      (event_id, workspace_id, entity_type, entity_id, action, actor_id, public_logger_session_id, before_state, after_state)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [eventId, workspaceId, entityType, entityId, action, 'userId' in actor ? actor.userId : null,
      'publicLoggerSessionId' in actor ? actor.publicLoggerSessionId : null,
      before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  );
}
