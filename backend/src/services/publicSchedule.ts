import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  type Discipline,
  type EventType,
  type EventStatus,
  type PublicClub,
  type PublicClubSchedule,
  type PublicScheduleEvent,
} from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { publicMediaPath } from './mediaStorage.js';

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

interface PublicScheduleClubRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_key: string | null;
  cover_key: string | null;
}

interface PublicScheduleEventRow {
  id: string;
  title: string;
  date: string;
  time: string | null;
  type: string;
  discipline: string | null;
  location_name: string | null;
  status: string;
}

function mapEventRow(row: PublicScheduleEventRow): PublicScheduleEvent {
  if (!EVENT_TYPES.includes(row.type as EventType)) throw notFound();
  if (!EVENT_STATUSES.includes(row.status as EventStatus)) throw notFound();
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    type: row.type as EventType,
    discipline: (row.discipline as Discipline | null) ?? null,
    locationName: row.location_name,
    status: row.status as EventStatus,
  };
}

function publicBrandSummary(row: PublicScheduleClubRow) {
  return {
    description: row.description,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    logoUrl: row.logo_key ? publicMediaPath(row.workspace_id, row.logo_key) : null,
    coverUrl: row.cover_key ? publicMediaPath(row.workspace_id, row.cover_key) : null,
  };
}

export async function listPublicScheduleClubs(
  search: string | null,
  executor: DbExecutor = getPool(),
): Promise<PublicClub[]> {
  const result = await executor.query<PublicScheduleClubRow>(
    `SELECT id, workspace_id, name, description, primary_color, accent_color, logo_key, cover_key
     FROM clubs
     WHERE public_schedule_enabled = true
       AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
     ORDER BY lower(name), id
     LIMIT 100`,
    [search],
  );
  return result.rows.map((row) => ({ id: row.id, name: row.name, branding: publicBrandSummary(row) }));
}

export async function getPublicClubSchedule(
  clubId: unknown,
  executor: DbExecutor = getPool(),
  now = new Date(),
): Promise<PublicClubSchedule> {
  if (!isCanonicalUuid(clubId)) throw notFound();
  const clubResult = await executor.query<PublicScheduleClubRow>(
    `SELECT id, workspace_id, name, description, primary_color, accent_color, logo_key, cover_key
     FROM clubs
     WHERE id = $1 AND public_schedule_enabled = true`,
    [clubId],
  );
  const club = clubResult.rows[0];
  if (!club) throw notFound();

  const nowDate = now.toISOString().slice(0, 10);
  const eventsResult = await executor.query<PublicScheduleEventRow>(
    `SELECT id, title, date::text AS date, time::text AS time, type, discipline, location_name, status
     FROM events
     WHERE workspace_id = $1
       AND date >= $2::date
       AND status IN ('scheduled', 'in_progress')
     ORDER BY date ASC, time ASC NULLS LAST, created_at ASC, id ASC`,
    [club.workspace_id, nowDate],
  );
  return {
    club: { id: club.id, name: club.name, branding: publicBrandSummary(club) },
    events: eventsResult.rows.map(mapEventRow),
  };
}
