import { getPool, type DbExecutor } from '../db/client.js';

export type ReminderThreshold = 'seven_days' | 'one_day';

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
