import { getPool, type DbExecutor } from '../db/client.js';
import { mapTimelineEntryRow, type TimelineEntryRow } from '../db/row-mappers.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import {
  DISCIPLINE_100M,
  RESULT_OUTCOMES,
  RESULT_UNIT_SECONDS,
  type EventStatus,
  type EventType,
  type ResultOutcome,
  type TimelineEntry,
} from '../types/domain.js';
import {
  calculatePlacings,
  checkPbSb,
  deriveEffectiveResult,
  deriveTrackTime,
} from './resultDerivation.js';
import {
  applyTimelineEntryPatch,
  type TimelineEntryCreatePayload,
  type TimelineEntryDeletePayload,
  type TimelineEntryPatchPayload,
} from '../validation/payloads.js';
import { isCanonicalUuid } from '../validation/primitives.js';

const TIMELINE_COLUMNS =
  'id, event_id, athlete_id, discipline, entry_type, value, unit, is_foul, incident_type, note_text, recorded_by, public_logger_session_id, version, device_id, created_at, updated_at, deleted_at';
const TIMELINE_SELECT_COLUMNS = TIMELINE_COLUMNS.split(', ')
  .map((column) => `te.${column}`)
  .join(', ');

type TransactionRunner = <T>(operation: (client: DbExecutor) => Promise<T>) => Promise<T>;

interface LockedEventRow {
  type: EventType;
  status: EventStatus;
}

interface LockedEntryRow extends TimelineEntryRow {
  event_type: EventType;
  event_status: EventStatus;
}

interface ScoringRow {
  athlete_id: string;
  outcome: ResultOutcome;
  final_result: string | number | null;
  manual_override: string | number | null;
  event_status?: EventStatus;
}

interface HistoricalResultRow extends ScoringRow {
  event_id: string;
  event_date: Date | string;
  event_status: EventStatus;
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function scopedIds(workspaceId: string, ...ids: unknown[]): string[] {
  if (!isCanonicalUuid(workspaceId) || !ids.every(isCanonicalUuid)) throw notFound();
  return ids as string[];
}

function assertLoggingOpen(status: EventStatus): void {
  if (status !== 'in_progress') {
    throw new ApiError(
      409,
      'EVENT_NOT_IN_PROGRESS',
      'Logging is only open while the event is in progress',
      { status },
    );
  }
}

function versionConflict(expectedVersion: number, actualVersion: number): ApiError {
  return new ApiError(
    409,
    'TIMELINE_ENTRY_VERSION_CONFLICT',
    'Timeline entry has been modified',
    { expectedVersion, actualVersion },
  );
}

function assertExpectedVersion(entry: TimelineEntry, expectedVersion: number): void {
  if (entry.version !== expectedVersion) {
    throw versionConflict(expectedVersion, entry.version);
  }
}

function numeric(value: string | number | null): number | null {
  if (value === null) return null;
  const converted = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(converted) || converted <= 0) {
    throw new Error('Database returned an invalid result value');
  }
  return converted;
}

function outcome(value: string): ResultOutcome {
  if (!RESULT_OUTCOMES.includes(value as ResultOutcome)) {
    throw new Error('Database returned an invalid result outcome');
  }
  return value as ResultOutcome;
}

function eventDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function effectiveScoring(row: ScoringRow): { value: number | null; outcome: ResultOutcome } {
  const derivedOutcome = outcome(row.outcome);
  const effective = deriveEffectiveResult(
    { value: numeric(row.final_result), outcome: derivedOutcome, incident: null },
    numeric(row.manual_override),
  );
  return { value: effective.value, outcome: effective.outcome };
}

async function recomputePlacings(
  client: DbExecutor,
  eventId: string,
): Promise<void> {
  const result = await client.query<ScoringRow>(
    `SELECT r.athlete_id, r.outcome, r.final_result, r.manual_override, e.status AS event_status
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.event_id = $1 AND r.discipline = $2
     ORDER BY r.athlete_id ASC`,
    [eventId, DISCIPLINE_100M],
  );
  const cancelled = result.rows[0]?.event_status === 'cancelled';
  const placings = cancelled
    ? new Map(result.rows.map((row) => [row.athlete_id, null]))
    : calculatePlacings(result.rows.map((row) => {
      const effective = effectiveScoring(row);
      return { athleteId: row.athlete_id, ...effective };
    }));
  for (const row of result.rows) {
    await client.query(
      `UPDATE results
       SET "placing" = $1, updated_at = now()
       WHERE event_id = $2 AND athlete_id = $3 AND discipline = $4`,
      [placings.get(row.athlete_id) ?? null, eventId, row.athlete_id, DISCIPLINE_100M],
    );
  }
}

async function recomputeBestFlags(
  client: DbExecutor,
  athleteId: string,
): Promise<void> {
  const result = await client.query<HistoricalResultRow>(
    `SELECT r.event_id,
            r.athlete_id,
            r.outcome,
            r.final_result,
            r.manual_override,
            e.date AS event_date,
            e.status AS event_status
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.athlete_id = $1 AND r.discipline = $2
     ORDER BY e.date ASC, e.time ASC NULLS LAST, e.created_at ASC, e.id ASC`,
    [athleteId, DISCIPLINE_100M],
  );
  const history: { value: number; date: string; outcome: ResultOutcome }[] = [];
  for (const row of result.rows) {
    const effective = effectiveScoring(row);
    const date = eventDate(row.event_date);
    const flags = row.event_status === 'cancelled'
      ? { isPb: false, isSb: false }
      : checkPbSb(effective.value, effective.outcome, date, history);
    await client.query(
      `UPDATE results
       SET is_pb = $1, is_sb = $2, updated_at = now()
       WHERE event_id = $3 AND athlete_id = $4 AND discipline = $5`,
      [flags.isPb, flags.isSb, row.event_id, athleteId, DISCIPLINE_100M],
    );
    if (row.event_status !== 'cancelled' && effective.outcome === 'valid' && effective.value !== null) {
      history.push({ value: effective.value, date, outcome: effective.outcome });
    }
  }
}

async function recomputeResult(
  client: DbExecutor,
  eventId: string,
  athleteId: string,
  eventType: EventType,
): Promise<void> {
  const entries = await client.query<TimelineEntryRow>(
    `SELECT ${TIMELINE_COLUMNS}
     FROM timeline_entries
     WHERE event_id = $1 AND athlete_id = $2 AND discipline = $3
     ORDER BY created_at ASC, id ASC`,
    [eventId, athleteId, DISCIPLINE_100M],
  );
  const derived = deriveTrackTime(entries.rows.map(mapTimelineEntryRow), eventType);
  await client.query(
    `INSERT INTO results
       (event_id, athlete_id, discipline, outcome, final_result, unit, "placing", is_pb, is_sb)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, false, false)
     ON CONFLICT (event_id, athlete_id, discipline)
     DO UPDATE SET outcome = EXCLUDED.outcome,
                   final_result = EXCLUDED.final_result,
                   unit = EXCLUDED.unit,
                    "placing" = NULL,
                   is_pb = false,
                   is_sb = false,
                   updated_at = now()`,
    [
      eventId,
      athleteId,
      DISCIPLINE_100M,
      derived.outcome,
      derived.value,
      derived.value === null ? null : RESULT_UNIT_SECONDS,
    ],
  );
  await recomputePlacings(client, eventId);
  await recomputeBestFlags(client, athleteId);
}

export async function lockEventResultAthletes(
  client: DbExecutor,
  eventId: string,
): Promise<string[]> {
  const athletes = await client.query<{ athlete_id: string }>(
    `SELECT athlete_id
     FROM timeline_entries
     WHERE event_id = $1 AND discipline = $2
     UNION
     SELECT athlete_id
     FROM results
     WHERE event_id = $1 AND discipline = $2
     ORDER BY athlete_id ASC`,
    [eventId, DISCIPLINE_100M],
  );
  if (athletes.rows.length > 0) {
    await client.query(
      `SELECT id
       FROM athletes
       WHERE id = ANY($1::uuid[])
       ORDER BY id ASC
       FOR UPDATE`,
      [athletes.rows.map((row) => row.athlete_id)],
    );
  }
  return athletes.rows.map((row) => row.athlete_id);
}

export async function recomputeEventResults(
  client: DbExecutor,
  eventId: string,
  eventType: EventType,
): Promise<void> {
  const athleteIds = await lockEventResultAthletes(client, eventId);
  for (const athleteId of athleteIds) {
    await recomputeResult(client, eventId, athleteId, eventType);
  }
}

async function lockOwnedEntry(
  client: DbExecutor,
  workspaceId: string,
  eventId: string,
  entryId: string,
  allowFixtureAccess = false,
): Promise<{ entry: TimelineEntry; eventType: EventType; eventStatus: EventStatus }> {
  const result = await client.query<LockedEntryRow>(
    `SELECT ${TIMELINE_SELECT_COLUMNS},
            e.type AS event_type,
            e.status AS event_status
     FROM timeline_entries te
     JOIN events e ON e.id = te.event_id
     JOIN athletes a ON a.id = te.athlete_id
      WHERE te.id = $1
        AND te.event_id = $2
        AND (
          (e.workspace_id = $3 AND a.workspace_id = $3)
          OR ($4::boolean AND a.workspace_id = $3 AND EXISTS (
            SELECT 1 FROM event_fixture_workspaces fw
            JOIN event_participants ep ON ep.event_id = fw.event_id
              AND ep.athlete_id = a.id AND ep.participant_workspace_id = fw.workspace_id
            WHERE fw.event_id = e.id AND fw.workspace_id = $3 AND fw.role = 'guest'
              AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
          ))
        )
      FOR UPDATE OF e, a, te`,
    [entryId, eventId, workspaceId, allowFixtureAccess],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return {
    entry: mapTimelineEntryRow(row),
    eventType: row.event_type,
    eventStatus: row.event_status,
  };
}

export async function listTimelineEntries(
  workspaceId: string,
  eventId: unknown,
  executor: DbExecutor = getPool(),
  allowFixtureAccess = false,
): Promise<TimelineEntry[]> {
  const [ownedEventId] = scopedIds(workspaceId, eventId);
  const fixtureCondition = allowFixtureAccess
    ? `OR ($3::boolean AND a.workspace_id = $2 AND EXISTS (
            SELECT 1 FROM event_fixture_workspaces fw
            JOIN event_participants ep ON ep.event_id = fw.event_id
              AND ep.athlete_id = a.id AND ep.participant_workspace_id = fw.workspace_id
            WHERE fw.event_id = e.id AND fw.workspace_id = $2 AND fw.role = 'guest'
              AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
          ))`
    : '';
  const result = await executor.query<TimelineEntryRow>(
    `SELECT ${TIMELINE_SELECT_COLUMNS}
     FROM timeline_entries te
     JOIN events e ON e.id = te.event_id
     JOIN athletes a ON a.id = te.athlete_id
      WHERE te.event_id = $1
        AND te.deleted_at IS NULL
        AND (
          (e.workspace_id = $2 AND a.workspace_id = $2)
          ${fixtureCondition}
        )
      ORDER BY te.created_at ASC, te.id ASC`,
    allowFixtureAccess ? [ownedEventId, workspaceId, true] : [ownedEventId, workspaceId],
  );
  return result.rows.map(mapTimelineEntryRow);
}

export async function createTimelineEntry(
  userId: string,
  eventId: unknown,
  payload: TimelineEntryCreatePayload,
  runTransaction: TransactionRunner = withTransaction,
  workspaceId = userId,
  allowFixtureAccess = false,
): Promise<TimelineEntry> {
  const [ownedEventId] = scopedIds(workspaceId, eventId, payload.athleteId);
  return runTransaction(async (client) => {
    const locked = await client.query<LockedEventRow>(
      `SELECT e.type, e.status
        FROM events e
        JOIN athletes a ON a.id = $2
        WHERE e.id = $1 AND (
          (e.workspace_id = $3 AND a.workspace_id = $3)
          OR ($4::boolean AND a.workspace_id = $3 AND EXISTS (
            SELECT 1 FROM event_fixture_workspaces fw
            JOIN event_participants ep ON ep.event_id = fw.event_id
              AND ep.athlete_id = a.id AND ep.participant_workspace_id = fw.workspace_id
            WHERE fw.event_id = e.id AND fw.workspace_id = $3 AND fw.role = 'guest'
              AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
          ))
        )
        FOR UPDATE OF e, a`,
        [ownedEventId, payload.athleteId, workspaceId, allowFixtureAccess],
    );
    const event = locked.rows[0];
    if (!event) throw notFound();
    assertLoggingOpen(event.status);

    const inserted = await client.query<TimelineEntryRow>(
      `INSERT INTO timeline_entries
         (event_id, athlete_id, discipline, entry_type, value, unit, is_foul, incident_type, note_text, recorded_by, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${TIMELINE_COLUMNS}`,
      [
        ownedEventId,
        payload.athleteId,
        payload.discipline,
        payload.entryType,
        payload.value,
        payload.unit,
        payload.isFoul,
        payload.incidentType,
        payload.noteText,
        userId,
        payload.deviceId,
      ],
    );
    const entry = mapTimelineEntryRow(inserted.rows[0]);
    await recomputeResult(client, ownedEventId, payload.athleteId, event.type);
    return entry;
  });
}

export async function updateTimelineEntry(
  workspaceId: string,
  eventId: unknown,
  entryId: unknown,
  patch: TimelineEntryPatchPayload,
  runTransaction: TransactionRunner = withTransaction,
  allowFixtureAccess = false,
): Promise<TimelineEntry> {
  const [ownedEventId, ownedEntryId] = scopedIds(workspaceId, eventId, entryId);
  return runTransaction(async (client) => {
    const { entry, eventType, eventStatus } = await lockOwnedEntry(
      client,
       workspaceId,
       ownedEventId,
       ownedEntryId,
       allowFixtureAccess,
    );
    if (entry.deletedAt !== null) throw notFound();
    assertLoggingOpen(eventStatus);
    assertExpectedVersion(entry, patch.expectedVersion);
    const state = applyTimelineEntryPatch({
      entryType: entry.entryType,
      value: entry.value,
      unit: entry.unit,
      incidentType: entry.incidentType,
      noteText: entry.noteText,
    }, patch);
    const updated = await client.query<TimelineEntryRow>(
      `UPDATE timeline_entries
       SET entry_type = $1,
           value = $2,
           unit = $3,
           incident_type = $4,
           note_text = $5,
           version = version + 1,
           updated_at = now()
       WHERE id = $6 AND event_id = $7 AND deleted_at IS NULL AND version = $8
       RETURNING ${TIMELINE_COLUMNS}`,
      [
        state.entryType,
        state.value,
        state.unit,
        state.incidentType,
        state.noteText,
        ownedEntryId,
        ownedEventId,
        patch.expectedVersion,
      ],
    );
    const row = updated.rows[0];
    if (!row) throw notFound();
    const result = mapTimelineEntryRow(row);
    await recomputeResult(client, ownedEventId, entry.athleteId, eventType);
    return result;
  });
}

export async function removeTimelineEntry(
  workspaceId: string,
  eventId: unknown,
  entryId: unknown,
  payload: TimelineEntryDeletePayload,
  runTransaction: TransactionRunner = withTransaction,
  allowFixtureAccess = false,
): Promise<void> {
  const [ownedEventId, ownedEntryId] = scopedIds(workspaceId, eventId, entryId);
  await runTransaction(async (client) => {
    const { entry, eventType, eventStatus } = await lockOwnedEntry(
      client,
       workspaceId,
       ownedEventId,
       ownedEntryId,
       allowFixtureAccess,
    );
    if (entry.deletedAt !== null) {
      if (entry.version === payload.expectedVersion + 1) return;
      throw versionConflict(payload.expectedVersion, entry.version);
    }
    assertLoggingOpen(eventStatus);
    assertExpectedVersion(entry, payload.expectedVersion);
    const removed = await client.query(
      `UPDATE timeline_entries
       SET deleted_at = now(), version = version + 1, updated_at = now()
       WHERE id = $1 AND event_id = $2 AND deleted_at IS NULL AND version = $3
       RETURNING id`,
      [ownedEntryId, ownedEventId, payload.expectedVersion],
    );
    if (removed.rows.length === 0) throw notFound();
    await recomputeResult(client, ownedEventId, entry.athleteId, eventType);
  });
}
