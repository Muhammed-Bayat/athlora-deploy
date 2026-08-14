import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { DISCIPLINE_100M } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

async function assertOwned(
  userId: string,
  resourceIds: readonly unknown[],
  query: string,
  queryParameters: string[],
  executor: DbExecutor,
): Promise<void> {
  if (!isCanonicalUuid(userId) || !resourceIds.every(isCanonicalUuid)) {
    throw notFound();
  }

  const result = await executor.query(query, queryParameters);
  if (result.rows.length === 0) {
    throw notFound();
  }
}

export async function assertAthleteOwnership(
  userId: string,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  await assertOwned(
    userId,
    [athleteId],
    `SELECT 1
     FROM athletes
     WHERE id = $1 AND coach_id = $2
     LIMIT 1`,
    [athleteId as string, userId],
    executor,
  );
}

export async function assertEventOwnership(
  userId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  await assertOwned(
    userId,
    [eventId],
    `SELECT 1
     FROM events
     WHERE id = $1 AND created_by = $2
     LIMIT 1`,
    [eventId as string, userId],
    executor,
  );
}

export async function assertEventAthleteOwnership(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  await assertOwned(
    userId,
    [eventId, athleteId],
    `SELECT 1
     FROM events e
     JOIN athletes a ON a.id = $2
     WHERE e.id = $1
       AND e.created_by = $3
       AND a.coach_id = $3
     LIMIT 1`,
    [eventId as string, athleteId as string, userId],
    executor,
  );
}

export async function assertTimelineEntryOwnership(
  userId: string,
  eventId: unknown,
  entryId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  await assertOwned(
    userId,
    [eventId, entryId],
    `SELECT 1
     FROM timeline_entries te
     JOIN events e ON e.id = te.event_id
     JOIN athletes a ON a.id = te.athlete_id
     WHERE te.id = $1
       AND te.event_id = $2
       AND e.created_by = $3
       AND a.coach_id = $3
     LIMIT 1`,
    [entryId as string, eventId as string, userId],
    executor,
  );
}

export async function assertParticipantOwnership(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  await assertOwned(
    userId,
    [eventId, athleteId],
    `SELECT 1
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     JOIN athletes a ON a.id = ep.athlete_id
     WHERE ep.event_id = $1
       AND ep.athlete_id = $2
       AND e.created_by = $3
       AND a.coach_id = $3
     LIMIT 1`,
    [eventId as string, athleteId as string, userId],
    executor,
  );
}

export async function assertResultOwnership(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  await assertOwned(
    userId,
    [eventId, athleteId],
    `SELECT 1
     FROM results r
     JOIN events e ON e.id = r.event_id
     JOIN athletes a ON a.id = r.athlete_id
      WHERE r.event_id = $1
        AND r.athlete_id = $2
        AND e.created_by = $3
        AND a.coach_id = $3
        AND r.discipline = $4
      LIMIT 1`,
    [eventId as string, athleteId as string, userId, DISCIPLINE_100M],
    executor,
  );
}
