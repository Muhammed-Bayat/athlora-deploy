import { getPool, type DbExecutor } from '../db/client.js';
import { mapEventRow, type EventRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import type { AthleticsEvent, EventStatus } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
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

function requireOwnedId(userId: string, eventId: unknown): asserts eventId is string {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(eventId)) {
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
  userId: string,
  query: EventListQuery,
  executor: DbExecutor = getPool(),
): Promise<AthleticsEvent[]> {
  if (!isCanonicalUuid(userId)) {
    throw notFound();
  }

  const conditions = ['created_by = $1'];
  const parameters: string[] = [userId];
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
  userId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<AthleticsEvent> {
  requireOwnedId(userId, eventId);

  const result = await executor.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events
     WHERE id = $1 AND created_by = $2`,
    [eventId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapEventRow(row);
}

export async function createEvent(
  userId: string,
  payload: EventCreatePayload,
  executor: DbExecutor = getPool(),
): Promise<AthleticsEvent> {
  if (!isCanonicalUuid(userId)) {
    throw notFound();
  }

  const result = await executor.query<EventRow>(
    `INSERT INTO events (created_by, type, discipline, title, date, time, location_name, latitude, longitude, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${EVENT_COLUMNS}`,
    [
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
  userId: string,
  eventId: unknown,
  payload: EventReplacementPayload,
  runTransaction: TransactionRunner = withTransaction,
): Promise<AthleticsEvent> {
  requireOwnedId(userId, eventId);

  return runTransaction(async (client) => {
    const current = await client.query<EventRow>(
      `SELECT ${EVENT_COLUMNS}
       FROM events
       WHERE id = $1 AND created_by = $2
       FOR UPDATE`,
      [eventId, userId],
    );
    const currentRow = current.rows[0];
    if (!currentRow) throw notFound();

    assertValidTransition(mapEventRow(currentRow).status, payload.status);

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
       WHERE id = $10 AND created_by = $11
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
        userId,
      ],
    );
    return mapEventRow(result.rows[0]);
  });
}

export async function cancelEvent(
  userId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<AthleticsEvent> {
  requireOwnedId(userId, eventId);

  const result = await executor.query<EventRow>(
    `UPDATE events
     SET status = 'cancelled',
         updated_at = now()
     WHERE id = $1 AND created_by = $2
     RETURNING ${EVENT_COLUMNS}`,
    [eventId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapEventRow(row);
}

export async function assertEventLoggingOpen(
  userId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
): Promise<void> {
  requireOwnedId(userId, eventId);

  const result = await executor.query<EventRow>(
    `SELECT ${EVENT_COLUMNS}
     FROM events
     WHERE id = $1 AND created_by = $2`,
    [eventId, userId],
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