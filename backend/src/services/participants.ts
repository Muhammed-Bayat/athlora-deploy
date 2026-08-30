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
       COALESCE((SELECT array_agg(s.name ORDER BY lower(s.name), s.id) FROM athlete_squads axs JOIN squads s ON s.id = axs.squad_id WHERE axs.athlete_id = a.id), ARRAY[]::text[]) AS athlete_squad_names,
        a.archived_at AS athlete_archived_at,
        a.lifecycle_status AS athlete_lifecycle_status,
        EXISTS (
          SELECT 1 FROM event_participant_status_reviews epsr
          WHERE epsr.event_id = ep.event_id
            AND epsr.athlete_id = ep.athlete_id
            AND epsr.acknowledged_at IS NULL
        ) AS status_review_required`;

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function scopedIds(workspaceId: string, ...ids: unknown[]): string[] {
  if (!isCanonicalUuid(workspaceId) || !ids.every(isCanonicalUuid)) throw notFound();
  return ids as string[];
}

async function getParticipant(
   workspaceId: string,
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
        AND e.workspace_id = $3
        AND a.workspace_id = $3`,
     [eventId, athleteId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapEventParticipantSummaryRow(row);
}

export async function listEventParticipants(
  workspaceId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<EventParticipantSummary[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  const result = await executor.query<EventParticipantSummaryRow>(
    `SELECT ${PARTICIPANT_COLUMNS}
     FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
     JOIN athletes a ON a.id = ep.athlete_id
     WHERE ep.event_id = $1
        AND e.workspace_id = $2
        AND a.workspace_id = $2
     ORDER BY lower(a.name) ASC, a.id ASC`,
    [ownedEventId, workspaceId],
  );
  return result.rows.map(mapEventParticipantSummaryRow);
}

export async function addEventParticipant(
  workspaceId: string,
  eventId: unknown,
  payload: EventParticipantCreatePayload,
  runTransaction: <T>(operation: (client: DbExecutor) => Promise<T>) => Promise<T> = withTransaction,
): Promise<EventParticipantSummary> {
  const [ownedEventId] = scopedIds(workspaceId, eventId, payload.athleteId);

  return runTransaction(async (client) => {
    const athlete = await client.query<{
      archived_at: Date | string | null;
      lifecycle_status: 'active' | 'inactive' | 'archived';
      already_assigned: boolean;
    }>(
       `SELECT a.archived_at, a.lifecycle_status,
              EXISTS (
                SELECT 1
                FROM event_participants ep
                WHERE ep.event_id = e.id AND ep.athlete_id = a.id
              ) AS already_assigned
       FROM events e
       JOIN athletes a ON a.id = $2
       WHERE e.id = $1
          AND e.workspace_id = $3
          AND a.workspace_id = $3
       FOR UPDATE OF e, a`,
       [ownedEventId, payload.athleteId, workspaceId],
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
    if (ownedAthlete.lifecycle_status === 'inactive') {
      throw new ApiError(409, 'ATHLETE_INACTIVE', 'Inactive athletes cannot be assigned to events');
    }

    const inserted = await client.query(
      `INSERT INTO event_participants (event_id, athlete_id, participant_workspace_id)
       SELECT $1, $2, workspace_id FROM athletes WHERE id = $2
       RETURNING event_id`,
      [ownedEventId, payload.athleteId],
    );
    if (inserted.rows.length === 0) throw notFound();
    return getParticipant(workspaceId, ownedEventId, payload.athleteId, client);
  });
}

export async function replaceEventParticipant(
  workspaceId: string,
  eventId: unknown,
  athleteId: unknown,
  payload: EventParticipantReplacementPayload,
  executor: DbExecutor = getPool(),
): Promise<EventParticipantSummary> {
  const [ownedEventId, ownedAthleteId] = scopedIds(workspaceId, eventId, athleteId);
  const result = await executor.query<EventParticipantSummaryRow>(
    `UPDATE event_participants ep
     SET rsvp_status = $1
     FROM events e, athletes a
     WHERE ep.event_id = $2
       AND ep.athlete_id = $3
       AND e.id = ep.event_id
       AND a.id = ep.athlete_id
        AND e.workspace_id = $4
        AND a.workspace_id = $4
     RETURNING ${PARTICIPANT_COLUMNS}`,
    [payload.rsvpStatus, ownedEventId, ownedAthleteId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapEventParticipantSummaryRow(row);
}

export async function removeEventParticipant(
  workspaceId: string,
  eventId: unknown,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  const [ownedEventId, ownedAthleteId] = scopedIds(workspaceId, eventId, athleteId);
  const result = await executor.query(
    `DELETE FROM event_participants ep
     USING events e, athletes a
     WHERE ep.event_id = $1
       AND ep.athlete_id = $2
       AND e.id = ep.event_id
       AND a.id = ep.athlete_id
        AND e.workspace_id = $3
        AND a.workspace_id = $3
     RETURNING ep.event_id`,
    [ownedEventId, ownedAthleteId, workspaceId],
  );
  if (result.rows.length === 0) throw notFound();
}

export async function acknowledgeParticipantStatusReview(
  workspaceId: string,
  actorId: string,
  eventId: unknown,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  const [ownedEventId, ownedAthleteId] = scopedIds(workspaceId, eventId, athleteId);
  if (!isCanonicalUuid(actorId)) throw notFound();
  await executor.query(
    `UPDATE event_participant_status_reviews epsr
     SET acknowledged_at = now(), acknowledged_by = $1
     FROM events e
     WHERE epsr.event_id = $2
       AND epsr.athlete_id = $3
       AND e.id = epsr.event_id
       AND e.workspace_id = $4
       AND epsr.acknowledged_at IS NULL`,
    [actorId, ownedEventId, ownedAthleteId, workspaceId],
  );
}
