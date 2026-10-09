import { getPool, type DbExecutor } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import type { MeetActor } from '../types/meets.js';
import { meetAccess, meetConflict, meetIds, meetNotFound } from './meetAccess.js';
import { getSession, changeSessionState } from './meets.js';

export interface SessionFinalizationJob {
  id: string;
  eventId: string;
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  errorMessage: string | null;
}

function map(row: Record<string, unknown>): SessionFinalizationJob {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    sessionId: row.session_id as string,
    status: row.status as SessionFinalizationJob['status'],
    attempts: Number(row.attempts),
    errorMessage: row.error_message as string | null,
  };
}

export async function queueSessionFinalization(actor: MeetActor, eventId: string, sessionId: string, expectedVersion: number): Promise<SessionFinalizationJob> {
  if (!('userId' in actor)) meetNotFound();
  meetIds(eventId, sessionId);
  return withTransaction(async (db) => {
    const access = await meetAccess(db, actor, eventId, true);
    if (!access.host || access.event.status !== 'in_progress') meetConflict('EVENT_NOT_IN_PROGRESS', 'The event must be in progress');
    const session = await getSession(db, eventId, sessionId);
    if (session.status !== 'in_progress' || session.version !== expectedVersion) meetConflict('SESSION_VERSION_CONFLICT', 'Session has been modified');
    const result = await db.query(
      `INSERT INTO session_finalization_jobs (event_id, session_id, workspace_id, requested_by, expected_version)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (session_id) DO UPDATE SET status = 'pending', expected_version = EXCLUDED.expected_version,
         requested_by = EXCLUDED.requested_by, error_message = NULL, updated_at = now()
       WHERE session_finalization_jobs.status = 'failed'
       RETURNING *`,
      [eventId, sessionId, access.event.workspace_id, actor.userId, expectedVersion],
    );
    const row = result.rows[0] ?? (await db.query('SELECT * FROM session_finalization_jobs WHERE session_id = $1', [sessionId])).rows[0];
    return map(row);
  });
}

export async function getSessionFinalizationJob(actor: MeetActor, eventId: string, sessionId: string, db: DbExecutor = getPool()): Promise<SessionFinalizationJob | null> {
  await meetAccess(db, actor, eventId);
  await getSession(db, eventId, sessionId);
  const result = await db.query('SELECT * FROM session_finalization_jobs WHERE session_id = $1', [sessionId]);
  return result.rows[0] ? map(result.rows[0]) : null;
}

export async function processSessionFinalizationJobs(): Promise<SessionFinalizationJob | null> {
  const job = await withTransaction(async (db) => {
    await db.query(
      `UPDATE session_finalization_jobs SET status = 'pending', started_at = NULL, updated_at = now()
       WHERE status = 'running' AND started_at < now() - INTERVAL '15 minutes'`,
    );
    const claimed = await db.query(
      `SELECT * FROM session_finalization_jobs WHERE status = 'pending'
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!claimed.rows[0]) return null;
    const row = (await db.query(
      `UPDATE session_finalization_jobs SET status = 'running', attempts = attempts + 1, started_at = now(), updated_at = now()
       WHERE id = $1 RETURNING *`, [claimed.rows[0].id],
    )).rows[0];
    return map(row);
  });
  if (!job) return null;
  try {
    const details = (await getPool().query<{ requested_by: string; workspace_id: string; expected_version: number }>(
      'SELECT requested_by, workspace_id, expected_version FROM session_finalization_jobs WHERE id = $1', [job.id],
    )).rows[0];
    if (!details) return null;
    await changeSessionState(
      { userId: details.requested_by, workspaceId: details.workspace_id, role: 'coach' },
      job.eventId,
      job.sessionId,
      { status: 'completed', expectedVersion: details.expected_version },
    );
    const completed = await getPool().query(`UPDATE session_finalization_jobs SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [job.id]);
    return completed.rows[0] ? map(completed.rows[0]) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Finalization failed';
    const failed = await getPool().query(`UPDATE session_finalization_jobs SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1 RETURNING *`, [job.id, message]);
    return failed.rows[0] ? map(failed.rows[0]) : null;
  }
}
