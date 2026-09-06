import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { isCanonicalUuid } from '../validation/primitives.js';

export type FixtureNotificationKind = 'fixture_invited' | 'fixture_responded' | 'fixture_reacceptance_required' | 'fixture_started';

export interface FixtureNotification {
  id: string;
  eventId: string;
  invitationId: string | null;
  kind: FixtureNotificationKind;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapNotification(row: {
  id: string; event_id: string; invitation_id: string | null; kind: FixtureNotificationKind;
  payload: Record<string, unknown>; read_at: Date | string | null; created_at: Date | string;
}): FixtureNotification {
  return {
    id: row.id,
    eventId: row.event_id,
    invitationId: row.invitation_id,
    kind: row.kind,
    payload: row.payload,
    readAt: timestamp(row.read_at),
    createdAt: timestamp(row.created_at)!,
  };
}

export async function notifyFixtureInvitation(
  client: DbExecutor, invitationId: string, eventId: string, email: string, targetWorkspaceId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO fixture_notifications (recipient_user_id, workspace_id, event_id, invitation_id, kind, payload, dedupe_key)
     SELECT u.id, wm.workspace_id, $2, $1, 'fixture_invited', jsonb_build_object('invitationId', $1), 'fixture:invited:' || $1
     FROM users u JOIN workspace_members wm ON wm.user_id = u.id
      WHERE ($4::uuid IS NULL AND lower(u.email) = lower($3))
         OR ($4::uuid IS NOT NULL AND wm.workspace_id = $4 AND wm.role = 'coach')
     ON CONFLICT (recipient_user_id, workspace_id, dedupe_key) DO NOTHING`,
    [invitationId, eventId, email, targetWorkspaceId],
  );
}

export async function notifyFixtureReacceptanceRequired(
  client: DbExecutor, invitationId: string, eventId: string, workspaceId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO fixture_notifications (recipient_user_id, workspace_id, event_id, invitation_id, kind, payload, dedupe_key)
     SELECT wm.user_id, wm.workspace_id, $2, $1, 'fixture_reacceptance_required', jsonb_build_object('invitationId', $1), 'fixture:reacceptance:' || $1
      FROM workspace_members wm WHERE wm.workspace_id = $3 AND wm.role = 'coach'
     ON CONFLICT (recipient_user_id, workspace_id, dedupe_key) DO NOTHING`,
    [invitationId, eventId, workspaceId],
  );
}

export async function notifyFixtureResponse(
  client: DbExecutor, eventId: string, invitationId: string, responseId: string, response: string, message: string | null, guestWorkspaceName: string,
): Promise<void> {
  await client.query(
    `INSERT INTO fixture_notifications (recipient_user_id, workspace_id, event_id, invitation_id, kind, payload, dedupe_key)
     SELECT wm.user_id, wm.workspace_id, $1, $2, 'fixture_responded',
            jsonb_build_object('response', $4, 'message', $5, 'guestWorkspaceName', $6), 'fixture:responded:' || $3
     FROM event_fixture_workspaces fw JOIN workspace_members wm ON wm.workspace_id = fw.workspace_id
     WHERE fw.event_id = $1 AND fw.role = 'host'
     ON CONFLICT (recipient_user_id, workspace_id, dedupe_key) DO NOTHING`,
    [eventId, invitationId, responseId, response, message, guestWorkspaceName],
  );
}

export async function notifyFixtureStarted(client: DbExecutor, eventId: string, revision: number): Promise<void> {
  await client.query(
    `INSERT INTO fixture_notifications (recipient_user_id, workspace_id, event_id, kind, payload, dedupe_key)
     SELECT wm.user_id, wm.workspace_id, $1, 'fixture_started', jsonb_build_object('revision', $2), 'fixture:started:' || $1 || ':' || $2
     FROM event_fixture_workspaces fw JOIN workspace_members wm ON wm.workspace_id = fw.workspace_id
     WHERE fw.event_id = $1 AND fw.role = 'guest' AND fw.status = 'accepted' AND fw.accepted_revision = $2
     ON CONFLICT (recipient_user_id, workspace_id, dedupe_key) DO NOTHING`,
    [eventId, revision],
  );
}

export async function listFixtureNotifications(userId: string, workspaceId: string, executor: DbExecutor = getPool()): Promise<FixtureNotification[]> {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(workspaceId)) throw notFound();
  const result = await executor.query<{
    id: string; event_id: string; invitation_id: string | null; kind: FixtureNotificationKind;
    payload: Record<string, unknown>; read_at: Date | string | null; created_at: Date | string;
  }>(
    `SELECT id, event_id, invitation_id, kind, payload, read_at, created_at
     FROM fixture_notifications
     WHERE recipient_user_id = $1 AND workspace_id = $2
     ORDER BY created_at DESC, id DESC`,
    [userId, workspaceId],
  );
  return result.rows.map(mapNotification);
}

export async function countUnreadFixtureNotifications(userId: string, workspaceId: string, executor: DbExecutor = getPool()): Promise<number> {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(workspaceId)) throw notFound();
  const result = await executor.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM fixture_notifications
     WHERE recipient_user_id = $1 AND workspace_id = $2 AND read_at IS NULL`,
    [userId, workspaceId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function markFixtureNotificationRead(userId: string, workspaceId: string, notificationId: unknown): Promise<void> {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(workspaceId) || !isCanonicalUuid(notificationId)) throw notFound();
  const result = await getPool().query(
    `UPDATE fixture_notifications SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND recipient_user_id = $2 AND workspace_id = $3
     RETURNING id`,
    [notificationId, userId, workspaceId],
  );
  if (!result.rows[0]) throw notFound();
}
