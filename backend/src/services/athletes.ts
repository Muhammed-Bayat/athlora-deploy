import { getPool, type DbExecutor } from '../db/client.js';
import { mapAthleteRow, type AthleteRow } from '../db/row-mappers.js';
import { ApiError } from '../middleware/errors.js';
import type { Athlete } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { withTransaction } from '../db/transaction.js';
import type {
  AthleteCreatePayload,
  AthleteListQuery,
  AthleteReplacementPayload,
} from '../validation/payloads.js';

const ATHLETE_COLUMNS = `a.id, a.coach_id, a.name, a.dob, a.gender, a.notes, a.archived_at, a.created_at, a.updated_at,
  COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'archivedAt', s.archived_at, 'createdAt', s.created_at, 'updatedAt', s.updated_at) ORDER BY lower(s.name), s.id)
    FROM athlete_squads axs JOIN squads s ON s.id = axs.squad_id WHERE axs.athlete_id = a.id), '[]'::json) AS squads`;

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function requireScopedId(workspaceId: string, athleteId: unknown): asserts athleteId is string {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(athleteId)) {
    throw notFound();
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listAthletes(
  workspaceId: string,
  query: AthleteListQuery,
  executor: DbExecutor = getPool(),
): Promise<Athlete[]> {
  if (!isCanonicalUuid(workspaceId)) {
    throw notFound();
  }

  const conditions = ['a.workspace_id = $1'];
  const parameters: string[] = [workspaceId];
  if (!query.includeArchived) {
    conditions.push('a.archived_at IS NULL');
  }
  if (query.name !== undefined) {
    parameters.push(`%${escapeLike(query.name)}%`);
    conditions.push(`a.name ILIKE $${parameters.length} ESCAPE '\\'`);
  }
  if (query.squadId !== undefined) {
    parameters.push(query.squadId);
    conditions.push(`EXISTS (SELECT 1 FROM athlete_squads axs WHERE axs.athlete_id = a.id AND axs.squad_id = $${parameters.length})`);
  }

  const result = await executor.query<AthleteRow>(
    `SELECT ${ATHLETE_COLUMNS}
     FROM athletes a
     WHERE ${conditions.join('\n       AND ')}
     ORDER BY LOWER(a.name) ASC, a.created_at ASC, a.id ASC`,
    parameters,
  );
  return result.rows.map(mapAthleteRow);
}

export async function getAthlete(
  workspaceId: string,
  athleteId: unknown,
  executor: DbExecutor = getPool(),
): Promise<Athlete> {
  void executor;
  requireScopedId(workspaceId, athleteId);

  const result = await executor.query<AthleteRow>(
    `SELECT ${ATHLETE_COLUMNS}
     FROM athletes a
       WHERE a.id = $1 AND a.workspace_id = $2`,
    [athleteId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return mapAthleteRow(row);
}

export async function createAthlete(
  userId: string,
  payload: AthleteCreatePayload,
  executor: DbExecutor | undefined = undefined,
  workspaceId = userId,
): Promise<Athlete> {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(userId)) {
    throw notFound();
  }

  const operation = async (client: DbExecutor) => {
    await verifySquads(workspaceId, payload.squadIds ?? [], client);
    const result = await client.query<{ id: string }>('INSERT INTO athletes (workspace_id, coach_id, name, dob, gender, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [workspaceId, userId, payload.name, payload.dob, payload.gender, payload.notes]);
    const athlete = result.rows[0];
    await replaceMemberships(workspaceId, athlete.id, payload.squadIds ?? [], client);
    return getAthlete(workspaceId, athlete.id, client);
  };
  return executor ? operation(executor) : withTransaction(operation);
}

export async function replaceAthlete(
  workspaceId: string,
  athleteId: unknown,
  payload: AthleteReplacementPayload,
  executor: DbExecutor | undefined = undefined,
): Promise<Athlete> {
  requireScopedId(workspaceId, athleteId);

  const operation = async (client: DbExecutor) => {
    await verifySquads(workspaceId, payload.squadIds ?? [], client);
    const result = await client.query(`UPDATE athletes SET name = $1, dob = $2, gender = $3, notes = $4, updated_at = now() WHERE id = $5 AND workspace_id = $6 RETURNING id`, [payload.name, payload.dob, payload.gender, payload.notes, athleteId, workspaceId]);
    if (!result.rows[0]) throw notFound();
    await replaceMemberships(workspaceId, athleteId, payload.squadIds ?? [], client);
    return getAthlete(workspaceId, athleteId, client);
  };
  return executor ? operation(executor) : withTransaction(operation);
}

async function verifySquads(workspaceId: string, squadIds: string[], executor: DbExecutor): Promise<void> {
  if (squadIds.length === 0) return;
  const result = await executor.query<{ id: string }>('SELECT id FROM squads WHERE workspace_id = $1 AND id = ANY($2::uuid[])', [workspaceId, squadIds]);
  if (result.rows.length !== squadIds.length) throw new ApiError(400, 'INVALID_SQUAD_IDS', 'All squads must belong to the current workspace');
}
async function replaceMemberships(workspaceId: string, athleteId: string, squadIds: string[], executor: DbExecutor): Promise<void> {
  await executor.query('DELETE FROM athlete_squads WHERE athlete_id = $1', [athleteId]);
  if (squadIds.length > 0) await executor.query('INSERT INTO athlete_squads (workspace_id, athlete_id, squad_id) SELECT $1, $2, unnest($3::uuid[])', [workspaceId, athleteId, squadIds]);
}

export async function setAthleteArchived(
  workspaceId: string,
  athleteId: unknown,
  archived: boolean,
  executor: DbExecutor = getPool(),
): Promise<Athlete> {
  requireScopedId(workspaceId, athleteId);

  const result = await executor.query<{ id: string }>(
    `UPDATE athletes
     SET ${archived ? 'archived_at = now()' : 'archived_at = NULL'},
         updated_at = now()
      WHERE id = $1 AND workspace_id = $2
     RETURNING id`,
    [athleteId, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return getAthlete(workspaceId, athleteId, executor);
}
