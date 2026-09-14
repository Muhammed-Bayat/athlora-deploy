import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { isCanonicalUuid } from '../validation/primitives.js';

export type ReminderThreshold = 'seven_days' | 'one_day';

export interface EventReminder {
  id: string;
  eventId: string;
  eventVersion: number;
  threshold: ReminderThreshold;
  scheduledFor: string;
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

function mapReminder(row: {
  id: string; event_id: string; event_version: number; threshold: ReminderThreshold;
  scheduled_for: Date | string; read_at: Date | string | null; created_at: Date | string;
}): EventReminder {
  return {
    id: row.id,
    eventId: row.event_id,
    eventVersion: row.event_version,
    threshold: row.threshold,
    scheduledFor: timestamp(row.scheduled_for)!,
    readAt: timestamp(row.read_at),
    createdAt: timestamp(row.created_at)!,
  };
}

// Events without a local start time intentionally have no actionable reminder.
export async function reconcileEventReminders(now = new Date(), executor: DbExecutor = getPool()): Promise<number> {
  const result = await executor.query<{ count: string }>(
    `WITH eligible AS (
       SELECT wm.user_id, e.workspace_id, e.id AS event_id, COALESCE(e.fixture_revision, 1) AS event_version,
              e.date::timestamp + e.time AS local_start
       FROM events e
       JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
       WHERE e.status = 'scheduled' AND e.time IS NOT NULL AND wm.role IN ('coach', 'assistant')
     ), due AS (
       SELECT user_id, workspace_id, event_id, event_version, 'seven_days'::text AS threshold, local_start - interval '7 days' AS scheduled_for FROM eligible
       UNION ALL
       SELECT user_id, workspace_id, event_id, event_version, 'one_day'::text, local_start - interval '1 day' FROM eligible
     )
     INSERT INTO event_reminders (user_id, workspace_id, event_id, event_version, threshold, scheduled_for)
     SELECT due.user_id, due.workspace_id, due.event_id, due.event_version, due.threshold, due.scheduled_for
     FROM due
     LEFT JOIN event_reminder_mutes mute ON mute.user_id = due.user_id AND mute.workspace_id = due.workspace_id AND mute.event_id = due.event_id
     WHERE due.scheduled_for <= $1 AND mute.user_id IS NULL
     ON CONFLICT (user_id, event_id, event_version, threshold) DO NOTHING
     RETURNING 1`,
    [now],
  );
  return result.rowCount ?? 0;
}

export async function listEventReminders(userId: string, workspaceId: string, executor: DbExecutor = getPool()): Promise<EventReminder[]> {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(workspaceId)) throw notFound();
  const result = await executor.query<{
    id: string; event_id: string; event_version: number; threshold: ReminderThreshold;
    scheduled_for: Date | string; read_at: Date | string | null; created_at: Date | string;
  }>(
    `SELECT id, event_id, event_version, threshold, scheduled_for, read_at, created_at
     FROM event_reminders
     WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL AND invalidated_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    [userId, workspaceId],
  );
  return result.rows.map(mapReminder);
}

export async function countUnreadEventReminders(userId: string, workspaceId: string, executor: DbExecutor = getPool()): Promise<number> {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(workspaceId)) throw notFound();
  const result = await executor.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM event_reminders
     WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL AND invalidated_at IS NULL`,
    [userId, workspaceId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function markEventReminderRead(userId: string, workspaceId: string, reminderId: unknown): Promise<void> {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(workspaceId) || !isCanonicalUuid(reminderId)) throw notFound();
  const result = await getPool().query(
    `UPDATE event_reminders SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2 AND workspace_id = $3 AND invalidated_at IS NULL
     RETURNING id`,
    [reminderId, userId, workspaceId],
  );
  if (!result.rows[0]) throw notFound();
}
