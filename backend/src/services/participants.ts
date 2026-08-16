import { getPool, type DbExecutor } from '../db/client.js';
import {
  mapEventParticipantSummaryRow,
  type EventParticipantSummaryRow,
} from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import type { EventParticipantSummary } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import type {
  EventParticipantCreatePayload,
  EventParticipantReplacementPayload,
} from '../validation/payloads.js';

const PARTICIPANT_COLUMNS = `ep.event_id,
       ep.athlete_id,
       ep.rsvp_status,
       a.name AS athlete_name,
       a.squad AS athlete_squad,
       a.archived_at AS athlete_archived_at`;

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function ownedIds(userId: string, ...ids: unknown[]): string[] {
  if (!isCanonicalUuid(userId) || !ids.every(isCanonicalUuid)) throw notFound();
  return ids as string[];
}

async function getParticipant(
  userId: string,
  eventId: string,
  athleteId: string,
  executor: DbExecutor,
): Promise<EventParticipantSummary> {
  const result = await executor.query<EventParticipantSummaryRow>(
    `SELECT ${PARTICIPANT_COLUMNS}
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     JOIN athletes a ON a.id = ep.athlete_id
     WHERE ep.event_id = $1
       AND ep.athlete_id = $2
       AND e.created_by = $3
       AND a.coach_id = $3`,
    [eventId, athleteId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapEventParticipantSummaryRow(row);
}

export async function listEventParticipants(
  userId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<EventParticipantSummary[]> {
  const [ownedEventId] = ownedIds(userId, eventId);
  const result = await executor.query<EventParticipantSummaryRow>(
    `SELECT ${PARTICIPANT_COLUMNS}
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     JOIN athletes a ON a.id = ep.athlete_id
     WHERE ep.event_id = $1
       AND e.created_by = $2
       AND a.coach_id = $2
     ORDER BY lower(a.name) ASC, a.id ASC`,
    [ownedEventId, userId],
  );
  return result.rows.map(mapEventParticipantSummaryRow);
}

export async function addEventParticipant(
  userId: string,
  eventId: unknown,
  payload: EventParticipantCreatePayload,
  runTransaction: <T>(operation: (client: DbExecutor) => Promise<T>) => Promise<T> = withTransaction,
): Promise<EventParticipantSummary> {
  const [ownedEventId] = ownedIds(userId, eventId, payload.athleteId);

  return runTransaction(async (client) => {
    const athlete = await client.query<{
      archived_at: Date | string | null;
      already_assigned: boolean;
    }>(
      `SELECT a.archived_at,
              EXISTS (
                SELECT 1
                FROM event_participants ep
                WHERE ep.event_id = e.id AND ep.athlete_id = a.id
              ) AS already_assigned
       FROM events e
       JOIN athletes a ON a.id = $2
       WHERE e.id = $1
         AND e.created_by = $3
         AND a.coach_id = $3
       FOR UPDATE OF e, a`,
      [ownedEventId, payload.athleteId, userId],
    );
    const ownedAthlete = athlete.rows[0];
    if (!ownedAthlete) throw notFound();
    if (ownedAthlete.already_assigned) {
      throw new ApiError(
        409,
        'PARTICIPANT_ALREADY_ASSIGNED',
        'Athlete is already assigned to this event',
      );
    }
    if (ownedAthlete.archived_at !== null) {
      throw new ApiError(409, 'ATHLETE_ARCHIVED', 'Archived athletes cannot be assigned to events');
    }

    const inserted = await client.query(
      `INSERT INTO event_participants (event_id, athlete_id)
       VALUES ($1, $2)
       RETURNING event_id`,
      [ownedEventId, payload.athleteId],
    );
    if (inserted.rows.length === 0) throw notFound();
    return getParticipant(userId, ownedEventId, payload.athleteId, client);
  });
}

export async function replaceEventParticipant(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
  payload: EventParticipantReplacementPayload,
  executor: DbExecutor = getPool(),
): Promise<EventParticipantSummary> {
  const [ownedEventId, ownedAthleteId] = ownedIds(userId, eventId, athleteId);
  const result = await executor.query<EventParticipantSummaryRow>(
    `UPDATE event_participants ep
     SET rsvp_status = $1
     FROM events e, athletes a
     WHERE ep.event_id = $2
       AND ep.athlete_id = $3
       AND e.id = ep.event_id
       AND a.id = ep.athlete_id
       AND e.created_by = $4
       AND a.coach_id = $4
     RETURNING ${PARTICIPANT_COLUMNS}`,
    [payload.rsvpStatus, ownedEventId, ownedAthleteId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapEventParticipantSummaryRow(row);
}

export async function removeEventParticipant(
  userId: string,
  eventId: unknown,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  const [ownedEventId, ownedAthleteId] = ownedIds(userId, eventId, athleteId);
  const result = await executor.query(
    `DELETE FROM event_participants ep
     USING events e, athletes a
     WHERE ep.event_id = $1
       AND ep.athlete_id = $2
       AND e.id = ep.event_id
       AND a.id = ep.athlete_id
       AND e.created_by = $3
       AND a.coach_id = $3
     RETURNING ep.event_id`,
    [ownedEventId, ownedAthleteId, userId],
  );
  if (result.rows.length === 0) throw notFound();
}
