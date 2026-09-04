import { createHash, randomBytes } from 'node:crypto';
import { getPool, type DbExecutor } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import { DISCIPLINE_100M, type EventStatus, type EventType, type TimelineEntry } from '../types/domain.js';
import type { TimelineEntryCreatePayload } from '../validation/payloads.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { mapTimelineEntryRow, type TimelineEntryRow } from '../db/row-mappers.js';
import { recomputeEventResults } from './timeline.js';

const TIMELINE_COLUMNS = 'id, event_id, athlete_id, discipline, entry_type, value, unit, is_foul, incident_type, note_text, recorded_by, public_logger_session_id, version, device_id, created_at, updated_at, deleted_at';

type TransactionRunner = <T>(operation: (client: DbExecutor) => Promise<T>) => Promise<T>;

export interface PublicLoggerLink {
  id: string;
  eventId: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
}

export interface PublicLoggerSnapshot {
  event: { id: string; title: string; status: EventStatus };
  participants: Array<{ athleteId: string; name: string }>;
  timeline: Array<Omit<TimelineEntry, 'recordedBy' | 'publicLoggerSessionId' | 'deviceId' | 'updatedAt' | 'deletedAt'>>;
}

interface LinkRow {
  id: string;
  event_id: string;
  status: 'active' | 'revoked';
  created_at: Date | string;
  revoked_at: Date | string | null;
}

interface SessionRow {
  id: string;
  event_id: string;
  title: string;
  status: EventStatus;
  expires_at: Date | string;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function unavailable(): ApiError {
  return new ApiError(401, 'PUBLIC_LOGGER_SESSION_INVALID', 'Public logger access is unavailable');
}

function assertUuid(value: unknown): asserts value is string {
  if (!isCanonicalUuid(value)) throw notFound();
}

function mapLink(row: LinkRow): PublicLoggerLink {
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    createdAt: timestamp(row.created_at),
    revokedAt: row.revoked_at === null ? null : timestamp(row.revoked_at),
  };
}

export function hashPublicLoggerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function sessionLifetimeMs(): number {
  const configured = Number(process.env.PUBLIC_LOGGER_SESSION_TTL_MINUTES ?? 120);
  const minutes = Number.isFinite(configured) ? Math.max(15, Math.min(240, configured)) : 120;
  return minutes * 60_000;
}

export async function createPublicLoggerLink(
  workspaceId: string,
  eventId: string,
  createdBy: string,
  executor: DbExecutor = getPool(),
): Promise<{ link: PublicLoggerLink; token: string }> {
  assertUuid(workspaceId); assertUuid(eventId); assertUuid(createdBy);
  const token = createOpaqueToken();
  const result = await executor.query<LinkRow>(
    `INSERT INTO public_logger_links (event_id, token_hash, created_by)
     SELECT e.id, $3, $4
     FROM events e
     WHERE e.id = $1 AND e.workspace_id = $2 AND e.status IN ('scheduled', 'in_progress')
     RETURNING id, event_id, status, created_at, revoked_at`,
    [eventId, workspaceId, hashPublicLoggerToken(token), createdBy],
  );
  if (!result.rows[0]) {
    throw new ApiError(409, 'PUBLIC_LOGGER_LINK_UNAVAILABLE', 'Links can only be created for scheduled or in-progress events');
  }
  return { link: mapLink(result.rows[0]), token };
}

export async function listPublicLoggerLinks(
  workspaceId: string,
  eventId: string,
  executor: DbExecutor = getPool(),
): Promise<PublicLoggerLink[]> {
  assertUuid(workspaceId); assertUuid(eventId);
  const result = await executor.query<LinkRow>(
    `SELECT pl.id, pl.event_id, pl.status, pl.created_at, pl.revoked_at
     FROM public_logger_links pl
     JOIN events e ON e.id = pl.event_id
     WHERE pl.event_id = $1 AND e.workspace_id = $2
     ORDER BY pl.created_at DESC, pl.id DESC`,
    [eventId, workspaceId],
  );
  return result.rows.map(mapLink);
}

export async function revokePublicLoggerLink(
  workspaceId: string,
  eventId: string,
  linkId: string,
  executor: DbExecutor = getPool(),
): Promise<void> {
  assertUuid(workspaceId); assertUuid(eventId); assertUuid(linkId);
  const result = await executor.query(
    `UPDATE public_logger_links pl
     SET status = 'revoked', revoked_at = now()
     FROM events e
     WHERE pl.id = $1 AND pl.event_id = $2 AND e.id = pl.event_id AND e.workspace_id = $3 AND pl.status = 'active'
     RETURNING pl.id`,
    [linkId, eventId, workspaceId],
  );
  if (result.rows.length === 0) throw notFound();
}

export async function createPublicLoggerSession(
  linkToken: string,
  loggerName: string,
  loggerClub: string,
  executor: DbExecutor = getPool(),
): Promise<{ sessionToken: string; snapshot: PublicLoggerSnapshot }> {
  const link = await executor.query<SessionRow>(
    `SELECT pl.id, pl.event_id, e.title, e.status, now() AS expires_at
     FROM public_logger_links pl
     JOIN events e ON e.id = pl.event_id
     WHERE pl.token_hash = $1 AND pl.status = 'active' AND e.status IN ('scheduled', 'in_progress')`,
    [hashPublicLoggerToken(linkToken)],
  );
  const row = link.rows[0];
  if (!row) throw unavailable();
  const sessionToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + sessionLifetimeMs());
  await executor.query(
    `INSERT INTO public_logger_sessions (link_id, event_id, token_hash, logger_name, logger_club, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, row.event_id, hashPublicLoggerToken(sessionToken), loggerName, loggerClub, expiresAt],
  );
  return { sessionToken, snapshot: await publicLoggerSnapshot(sessionToken, row.event_id, executor) };
}

export async function createPublicLoggerSessionByEvent(
  eventId: string,
  loggerName: string,
  loggerClub: string,
  executor: DbExecutor = getPool(),
): Promise<{ sessionToken: string; snapshot: PublicLoggerSnapshot }> {
  assertUuid(eventId);
  const link = await executor.query<LinkRow>(
    `SELECT pl.id, pl.event_id, e.title, e.status, e.workspace_id
     FROM public_logger_links pl
     JOIN events e ON e.id = pl.event_id
     WHERE pl.event_id = $1 AND e.status IN ('scheduled', 'in_progress')
     ORDER BY pl.created_at DESC
     LIMIT 1`,
    [eventId],
  );
  const row = link.rows[0];
  const targetLinkId = row?.id;
  const sessionToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + sessionLifetimeMs());
  await executor.query(
    `INSERT INTO public_logger_sessions (link_id, event_id, token_hash, logger_name, logger_club, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [targetLinkId, eventId, hashPublicLoggerToken(sessionToken), loggerName, loggerClub, expiresAt],
  );
  return { sessionToken, snapshot: await publicLoggerSnapshot(sessionToken, eventId, executor) };
}

async function validSession(
  sessionToken: string,
  eventId: string,
  executor: DbExecutor,
): Promise<SessionRow> {
  assertUuid(eventId);
  const result = await executor.query<SessionRow>(
    `SELECT ps.id, ps.event_id, e.title, e.status, ps.expires_at
     FROM public_logger_sessions ps
     JOIN public_logger_links pl ON pl.id = ps.link_id
     JOIN events e ON e.id = ps.event_id
     WHERE ps.token_hash = $1 AND ps.event_id = $2 AND pl.event_id = ps.event_id
       AND pl.status = 'active' AND ps.expires_at > now()
       AND e.status IN ('scheduled', 'in_progress')`,
    [hashPublicLoggerToken(sessionToken), eventId],
  );
  const row = result.rows[0];
  if (!row) throw unavailable();
  if (row.event_id !== eventId) throw unavailable();
  return row;
}

export async function publicLoggerSnapshot(
  sessionToken: string,
  eventId: string,
  executor: DbExecutor = getPool(),
): Promise<PublicLoggerSnapshot> {
  const session = await validSession(sessionToken, eventId, executor);
  const [participants, entries] = await Promise.all([
    executor.query<{ athlete_id: string; name: string }>(
      `SELECT ep.athlete_id, a.name
       FROM event_participants ep
       JOIN athletes a ON a.id = ep.athlete_id
       WHERE ep.event_id = $1
       ORDER BY a.name ASC, a.id ASC`,
      [session.event_id],
    ),
    executor.query<TimelineEntryRow>(
      `SELECT ${TIMELINE_COLUMNS}
       FROM timeline_entries
       WHERE event_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [session.event_id],
    ),
  ]);
  return {
    event: { id: session.event_id, title: session.title, status: session.status },
    participants: participants.rows.map((participant) => ({ athleteId: participant.athlete_id, name: participant.name })),
    timeline: entries.rows.map((entry) => {
      const {
        recordedBy: _recordedBy,
        publicLoggerSessionId: _publicLoggerSessionId,
        deviceId: _deviceId,
        updatedAt: _updatedAt,
        deletedAt: _deletedAt,
        ...publicEntry
      } = mapTimelineEntryRow(entry);
      return publicEntry;
    }),
  };
}

export async function createPublicLoggerEntry(
  sessionToken: string,
  eventId: string,
  payload: TimelineEntryCreatePayload,
  runTransaction: TransactionRunner = withTransaction,
): Promise<Omit<TimelineEntry, 'recordedBy' | 'publicLoggerSessionId' | 'deviceId' | 'updatedAt' | 'deletedAt'>> {
  assertUuid(eventId);
  return runTransaction(async (client) => {
    const session = await client.query<{ id: string; type: EventType; status: EventStatus }>(
      `SELECT ps.id, e.type, e.status
       FROM public_logger_sessions ps
       JOIN public_logger_links pl ON pl.id = ps.link_id
       JOIN events e ON e.id = ps.event_id
       WHERE ps.token_hash = $1 AND ps.event_id = $2 AND pl.event_id = ps.event_id
         AND pl.status = 'active' AND ps.expires_at > now()
       FOR UPDATE OF ps, pl, e`,
      [hashPublicLoggerToken(sessionToken), eventId],
    );
    const actor = session.rows[0];
    if (!actor || actor.status !== 'in_progress') throw unavailable();
    const participant = await client.query(
      'SELECT 1 FROM event_participants WHERE event_id = $1 AND athlete_id = $2',
      [eventId, payload.athleteId],
    );
    if (participant.rows.length === 0) throw notFound();
    const inserted = await client.query<TimelineEntryRow>(
      `INSERT INTO timeline_entries
       (event_id, athlete_id, discipline, entry_type, value, unit, is_foul, incident_type, note_text, recorded_by, public_logger_session_id, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, NULL)
       RETURNING ${TIMELINE_COLUMNS}`,
      [eventId, payload.athleteId, DISCIPLINE_100M, payload.entryType, payload.value, payload.unit, false, payload.incidentType, null, actor.id],
    );
    await recomputeEventResults(client, eventId, actor.type);
    const {
      recordedBy: _recordedBy,
      publicLoggerSessionId: _publicLoggerSessionId,
      deviceId: _deviceId,
      updatedAt: _updatedAt,
      deletedAt: _deletedAt,
      ...publicEntry
    } = mapTimelineEntryRow(inserted.rows[0]);
    return publicEntry;
  });
}
