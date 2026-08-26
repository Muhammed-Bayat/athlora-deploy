import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { DISCIPLINE_100M } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

async function assertScoped(
  workspaceId: string,
  resourceIds: readonly unknown[],
  query: string,
  parameters: string[],
  executor: DbExecutor,
): Promise<void> {
  if (!isCanonicalUuid(workspaceId) || !resourceIds.every(isCanonicalUuid)) throw notFound();
  if ((await executor.query(query, parameters)).rows.length === 0) throw notFound();
}

export async function assertAthleteOwnership(workspaceId: string, athleteId: unknown, executor: DbExecutor = getPool()): Promise<void> {
  await assertScoped(workspaceId, [athleteId], 'SELECT 1 FROM athletes WHERE id = $1 AND workspace_id = $2 LIMIT 1', [athleteId as string, workspaceId], executor);
}

export async function assertEventOwnership(workspaceId: string, eventId: unknown, executor: DbExecutor = getPool()): Promise<void> {
  await assertScoped(workspaceId, [eventId], 'SELECT 1 FROM events WHERE id = $1 AND workspace_id = $2 LIMIT 1', [eventId as string, workspaceId], executor);
}

async function assertEventAthleteScoped(workspaceId: string, eventId: unknown, athleteId: unknown, table: string, executor: DbExecutor): Promise<void> {
  const relationship = table === 'events' ? '' : `JOIN ${table} x ON x.event_id = e.id AND x.athlete_id = a.id`;
  await assertScoped(workspaceId, [eventId, athleteId], `SELECT 1 FROM events e JOIN athletes a ON a.id = $2 ${relationship} WHERE e.id = $1 AND e.workspace_id = $3 AND a.workspace_id = $3 LIMIT 1`, [eventId as string, athleteId as string, workspaceId], executor);
}

export async function assertEventAthleteOwnership(workspaceId: string, eventId: unknown, athleteId: unknown, executor: DbExecutor = getPool()): Promise<void> {
  await assertEventAthleteScoped(workspaceId, eventId, athleteId, 'events', executor);
}

export async function assertParticipantOwnership(workspaceId: string, eventId: unknown, athleteId: unknown, executor: DbExecutor = getPool()): Promise<void> {
  await assertEventAthleteScoped(workspaceId, eventId, athleteId, 'event_participants', executor);
}

export async function assertTimelineEntryOwnership(workspaceId: string, eventId: unknown, entryId: unknown, executor: DbExecutor = getPool()): Promise<void> {
  await assertScoped(workspaceId, [eventId, entryId], `SELECT 1 FROM timeline_entries te JOIN events e ON e.id = te.event_id JOIN athletes a ON a.id = te.athlete_id WHERE te.id = $1 AND te.event_id = $2 AND e.workspace_id = $3 AND a.workspace_id = $3 LIMIT 1`, [entryId as string, eventId as string, workspaceId], executor);
}

export async function assertResultOwnership(workspaceId: string, eventId: unknown, athleteId: unknown, executor: DbExecutor = getPool()): Promise<void> {
  await assertScoped(workspaceId, [eventId, athleteId], `SELECT 1 FROM results r JOIN events e ON e.id = r.event_id JOIN athletes a ON a.id = r.athlete_id WHERE r.event_id = $1 AND r.athlete_id = $2 AND e.workspace_id = $3 AND a.workspace_id = $3 AND r.discipline = $4 LIMIT 1`, [eventId as string, athleteId as string, workspaceId, DISCIPLINE_100M], executor);
}
