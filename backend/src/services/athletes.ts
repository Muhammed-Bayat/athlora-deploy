import { getPool, type DbExecutor } from '../db/client.js';
import { mapAthleteRow, type AthleteRow } from '../db/row-mappers.js';
import { ApiError } from '../middleware/errors.js';
import type { Athlete } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import type {
  AthleteCreatePayload,
  AthleteListQuery,
  AthleteReplacementPayload,
} from '../validation/payloads.js';

const ATHLETE_COLUMNS =
  'id, coach_id, name, dob, gender, squad, notes, archived_at, created_at, updated_at';

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function requireOwnedId(userId: string, athleteId: unknown): asserts athleteId is string {
  if (!isCanonicalUuid(userId) || !isCanonicalUuid(athleteId)) {
    throw notFound();
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listAthletes(
  userId: string,
  query: AthleteListQuery,
  executor: DbExecutor = getPool(),
): Promise<Athlete[]> {
  if (!isCanonicalUuid(userId)) {
    throw notFound();
  }

  const conditions = ['coach_id = $1'];
  const parameters: string[] = [userId];
  if (!query.includeArchived) {
    conditions.push('archived_at IS NULL');
  }
  if (query.name !== undefined) {
    parameters.push(`%${escapeLike(query.name)}%`);
    conditions.push(`name ILIKE $${parameters.length} ESCAPE '\\'`);
  }
  if (query.squad !== undefined) {
    parameters.push(query.squad);
    conditions.push(`squad = $${parameters.length}`);
  }

  const result = await executor.query<AthleteRow>(
    `SELECT ${ATHLETE_COLUMNS}
     FROM athletes
     WHERE ${conditions.join('\n       AND ')}
     ORDER BY LOWER(name) ASC, created_at ASC, id ASC`,
    parameters,
  );
  return result.rows.map(mapAthleteRow);
}

export async function getAthlete(
  userId: string,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<Athlete> {
  requireOwnedId(userId, athleteId);

  const result = await executor.query<AthleteRow>(
    `SELECT ${ATHLETE_COLUMNS}
     FROM athletes
     WHERE id = $1 AND coach_id = $2`,
    [athleteId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapAthleteRow(row);
}

export async function createAthlete(
  userId: string,
  payload: AthleteCreatePayload,
  executor: DbExecutor = getPool(),
): Promise<Athlete> {
  if (!isCanonicalUuid(userId)) {
    throw notFound();
  }

  const result = await executor.query<AthleteRow>(
    `INSERT INTO athletes (coach_id, name, dob, gender, squad, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${ATHLETE_COLUMNS}`,
    [userId, payload.name, payload.dob, payload.gender, payload.squad, payload.notes],
  );
  return mapAthleteRow(result.rows[0]);
}

export async function replaceAthlete(
  userId: string,
  athleteId: unknown,
  payload: AthleteReplacementPayload,
  executor: DbExecutor = getPool(),
): Promise<Athlete> {
  requireOwnedId(userId, athleteId);

  const result = await executor.query<AthleteRow>(
    `UPDATE athletes
     SET name = $1,
         dob = $2,
         gender = $3,
         squad = $4,
         notes = $5,
         updated_at = now()
     WHERE id = $6 AND coach_id = $7
     RETURNING ${ATHLETE_COLUMNS}`,
    [payload.name, payload.dob, payload.gender, payload.squad, payload.notes, athleteId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapAthleteRow(row);
}

export async function setAthleteArchived(
  userId: string,
  athleteId: unknown,
  archived: boolean,
  executor: DbExecutor = getPool(),
): Promise<Athlete> {
  requireOwnedId(userId, athleteId);

  const result = await executor.query<AthleteRow>(
    `UPDATE athletes
     SET ${archived ? 'archived_at = now()' : 'archived_at = NULL'},
         updated_at = now()
     WHERE id = $1 AND coach_id = $2
     RETURNING ${ATHLETE_COLUMNS}`,
    [athleteId, userId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapAthleteRow(row);
}
