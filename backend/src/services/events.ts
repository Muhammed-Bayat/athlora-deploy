import { getPool, type DbExecutor } from '../db/client.js';
import { mapEventRow, type EventRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import type { AthleticsEvent, EventStatus } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { recomputeEventResults } from './timeline.js';
import type {
  EventCreatePayload,
  EventListQuery,
  EventReplacementPayload,
} from '../validation/payloads.js';

const EVENT_COLUMNS =
  'id, created_by, type, discipline, title, date, time, location_name, latitude, longitude, status, created_at, updated_at';

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function requireScopedId(workspaceId: string, eventId: unknown): asserts eventId is string {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(eventId)) {
    throw notFound();
  }
}

// Forward-only lifecycle: cancelled is terminal, so a cancelled event can never
// start again and completed events cannot revert.
const ALLOWED_TRANSITIONS: Readonly<Record<EventStatus, readonly EventStatus[]>> = {
  scheduled: ['scheduled', 'in_progress', 'completed', 'cancelled'],
  in_progress: ['in_progress', 'completed', 'cancelled'],
  completed: ['completed', 'cancelled'],
  cancelled: ['cancelled'],
};

export function assertValidTransition(from: EventStatus, to: EventStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ApiError(
      409,
      'INVALID_EVENT_TRANSITION',
      `Cannot move an event from ${from} to ${to}`,
      { from, to },
    );
  }
}

export async function listEvents(
  workspaceId: string,
  query: EventListQuery,
  executor: DbExecutor = getPool(),
): Promise<AthleticsEvent[]> {
  if (!isCanonicalUuid(workspaceId)) {
    throw notFound();
  }

  const conditions = ['workspace_id = $1'];
  const parameters: string[] = [workspaceId];
  if (query.type !== undefined) {
    parameters.push(query.type);
    conditions.push(`type = $${parameters.length}`);
  }
  if (query.status !== undefined) {
    parameters.push(query.status);
    conditions.push(`status = $${parameters.length}`);
  }
  if (query.dateFrom !== undefined) {
    parameters.push(query.dateFrom);
    conditions.push(`date >= $${parameters.length}`);
  }
  if (query.dateTo !== undefined) {
    parameters.push(query.dateTo);
    conditions.push(`date <= $${parameters.length}`);
  }

  const result = await executor.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events
     WHERE ${conditions.join('\n       AND ')}
     ORDER BY date ASC, time ASC NULLS LAST, created_at ASC, id ASC`,
    parameters,
  );
  return result.rows.map(mapEventRow);
}

export async function getEvent(
  workspaceId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<AthleticsEvent> {
  requireScopedId(workspaceId, eventId);

  const result = await executor.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events
      WHERE id = $1 AND workspace_id = $2`,
    [eventId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapEventRow(row);
}

export async function createEvent(
  userId: string,
  payload: EventCreatePayload,
  executor: DbExecutor = getPool(),
  workspaceId = userId,
): Promise<AthleticsEvent> {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(userId)) {
    throw notFound();
  }

  const result = await executor.query<EventRow>(
    `INSERT INTO events (workspace_id, created_by, type, discipline, title, date, time, location_name, latitude, longitude, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${EVENT_COLUMNS}`,
    [
      workspaceId,
      userId,
      payload.type,
      payload.discipline,
      payload.title,
      payload.date,
      payload.time,
      payload.locationName,
      payload.latitude,
      payload.longitude,
      payload.status,
    ],
  );
  return mapEventRow(result.rows[0]);
}

type TransactionRunner = <T>(operation: (client: DbExecutor) => Promise<T>) => Promise<T>;

export async function replaceEvent(
  workspaceId: string,
  eventId: unknown,
  payload: EventReplacementPayload,
  runTransaction: TransactionRunner = withTransaction,
): Promise<AthleticsEvent> {
  requireScopedId(workspaceId, eventId);

  return runTransaction(async (client) => {
    const current = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS}
       FROM events
        WHERE id = $1 AND workspace_id = $2
       FOR UPDATE`,
       [eventId, workspaceId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) throw notFound();

    const currentEvent = mapEventRow(currentRow);
    assertValidTransition(currentEvent.status, payload.status);

    const result = await client.query<EventRow>(
      `UPDATE events
       SET type = $1,
           discipline = $2,
           title = $3,
           date = $4,
           time = $5,
           location_name = $6,
           latitude = $7,
           longitude = $8,
           status = $9,
           updated_at = now()
        WHERE id = $10 AND workspace_id = $11
       RETURNING ${EVENT_COLUMNS}`,
      [
        payload.type,
        payload.discipline,
        payload.title,
        payload.date,
        payload.time,
        payload.locationName,
        payload.latitude,
        payload.longitude,
        payload.status,
        eventId,
         workspaceId,
      ],
    );
    const updated = mapEventRow(result.rows[0]);
    if (
      currentEvent.type !== updated.type ||
      currentEvent.date !== updated.date ||
      currentEvent.time !== updated.time ||
      currentEvent.status !== updated.status
    ) {
      await recomputeEventResults(client, eventId, updated.type);
    }
    return updated;
  });
}

export async function cancelEvent(
  workspaceId: string,
  eventId: unknown,
  runTransaction: TransactionRunner = withTransaction,
): Promise<AthleticsEvent> {
  requireScopedId(workspaceId, eventId);
  return runTransaction(async (client) => {
    const current = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS}
       FROM events
        WHERE id = $1 AND workspace_id = $2
       FOR UPDATE`,
       [eventId, workspaceId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) throw notFound();
    const currentEvent = mapEventRow(currentRow);
    const result = await client.query<EventRow>(
      `UPDATE events
       SET status = 'cancelled',
           updated_at = now()
        WHERE id = $1 AND workspace_id = $2
       RETURNING ${EVENT_COLUMNS}`,
       [eventId, workspaceId],
    );
    const cancelled = mapEventRow(result.rows[0]);
    if (currentEvent.status !== 'cancelled') {
      await recomputeEventResults(client, eventId, cancelled.type);
    }
    return cancelled;
  });
}

export async function assertEventLoggingOpen(
  workspaceId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  requireScopedId(workspaceId, eventId);

  const result = await executor.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events
      WHERE id = $1 AND workspace_id = $2`,
    [eventId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();

  const status = mapEventRow(row).status;
  if (status !== 'in_progress') {
    throw new ApiError(
      409,
      'EVENT_NOT_IN_PROGRESS',
      'Logging is only open while the event is in progress',
      { status },
    );
  }
}
