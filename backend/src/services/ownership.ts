import { getPool } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { DISCIPLINE_100M } from '../types/domain.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

async function assertOwned(
  userId: string,
  resourceIds: readonly unknown[],
  query: string,
  queryParameters: string[],
): Promise<void> {
  if (!isUuid(userId) || !resourceIds.every(isUuid)) {
    throw notFound();
  }

  const result = await getPool().query(query, queryParameters);
  if (result.rows.length === 0) {
    throw notFound();
  }
}

export async function assertAthleteOwnership(userId: string, athleteId: unknown): Promise<void> {
  await assertOwned(
    userId,
    [athleteId],
    `SELECT 1
     FROM athletes
     WHERE id = $1 AND coach_id = $2
     LIMIT 1`,
    [athleteId as string, userId],
  );
}

export async function assertEventOwnership(userId: string, eventId: unknown): Promise<void> {
  await assertOwned(
    userId,
    [eventId],
    `SELECT 1
     FROM events
     WHERE id = $1 AND created_by = $2
     LIMIT 1`,
    [eventId as string, userId],
  );
}

export async function assertEventAthleteOwnership(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
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
  );
}

export async function assertTimelineEntryOwnership(
  userId: string,
  eventId: unknown,
  entryId: unknown,
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
  );
}

export async function assertParticipantOwnership(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
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
  );
}

export async function assertResultOwnership(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
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
  );
}
