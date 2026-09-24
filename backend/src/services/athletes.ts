import { getPool, type DbExecutor } from '../db/client.js';
import { mapAthleteRow, type AthleteRow } from '../db/row-mappers.js';
import { ApiError } from '../middleware/errors.js';
import type { Athlete, AthleteLifecycleStatus } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { withTransaction } from '../db/transaction.js';
import type {
  AthleteCreatePayload,
  AthleteListQuery,
  AthleteReplacementPayload,
} from '../validation/payloads.js';

const ATHLETE_COLUMNS = `a.id, a.coach_id, a.name, a.dob, a.gender, a.notes, a.archived_at, a.lifecycle_status, a.status_changed_at, a.status_changed_by, a.created_at, a.updated_at,
  COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'archivedAt', s.archived_at, 'createdAt', s.created_at, 'updatedAt', s.updated_at) ORDER BY lower(s.name), s.id)
    FROM athlete_squads axs JOIN squads s ON s.id = axs.squad_id WHERE axs.athlete_id = a.id), '[]'::json) AS squads,
  COALESCE((SELECT json_agg(apd.discipline_definition_id ORDER BY apd.discipline_definition_id) FROM athlete_preferred_disciplines apd WHERE apd.athlete_id = a.id), '[]'::json) AS preferred_discipline_ids,
  COALESCE((SELECT json_agg(json_build_object('id', g.id, 'disciplineDefinitionId', g.discipline_definition_id, 'targetValue', g.target_value::float8, 'targetUnit', g.target_unit, 'targetDate', g.target_date, 'status', g.status, 'createdAt', g.created_at, 'updatedAt', g.updated_at) ORDER BY g.created_at, g.id) FROM athlete_season_goals g WHERE g.athlete_id = a.id), '[]'::json) AS season_goals`;

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
  if (query.status !== undefined) {
    parameters.push(query.status);
    conditions.push(`a.lifecycle_status = $${parameters.length}`);
  } else if (!query.includeArchived) {
    conditions.push(`a.lifecycle_status <> 'archived'`);
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
    await verifyDisciplineProfile(payload, client);
    const result = await client.query<{ id: string }>('INSERT INTO athletes (workspace_id, coach_id, name, dob, gender, notes, status_changed_by) VALUES ($1, $2, $3, $4, $5, $6, $2) RETURNING id', [workspaceId, userId, payload.name, payload.dob, payload.gender, payload.notes]);
    const athlete = result.rows[0];
    await replaceMemberships(workspaceId, athlete.id, payload.squadIds ?? [], client);
    if (payload.preferredDisciplineIds !== undefined || payload.seasonGoals !== undefined) await replaceDisciplineProfile(athlete.id, payload, client);
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
    await verifyDisciplineProfile(payload, client);
    const result = await client.query<{ id: string; lifecycle_status: AthleteLifecycleStatus }>(
      `UPDATE athletes
       SET name = CASE WHEN lifecycle_status = 'archived' THEN name ELSE $1 END,
           dob = CASE WHEN lifecycle_status = 'archived' THEN dob ELSE $2 END,
           gender = CASE WHEN lifecycle_status = 'archived' THEN gender ELSE $3 END,
           notes = CASE WHEN lifecycle_status = 'archived' THEN notes ELSE $4 END,
           updated_at = CASE WHEN lifecycle_status = 'archived' THEN updated_at ELSE now() END
       WHERE id = $5 AND workspace_id = $6
       RETURNING id, lifecycle_status`,
      [payload.name, payload.dob, payload.gender, payload.notes, athleteId, workspaceId],
    );
    const updated = result.rows[0];
    if (!updated) throw notFound();
    if (updated.lifecycle_status === 'archived') {
      throw new ApiError(409, 'ATHLETE_ARCHIVED_READ_ONLY', 'Archived athletes must be restored before editing');
    }
    await replaceMemberships(workspaceId, athleteId, payload.squadIds ?? [], client);
    if (payload.preferredDisciplineIds !== undefined || payload.seasonGoals !== undefined) await replaceDisciplineProfile(athleteId, payload, client);
    return getAthlete(workspaceId, athleteId, client);
  };
  return executor ? operation(executor) : withTransaction(operation);
}

async function verifyDisciplineProfile(payload: AthleteCreatePayload, executor: DbExecutor): Promise<void> {
  const ids = [...new Set([...(payload.preferredDisciplineIds ?? []), ...(payload.seasonGoals ?? []).map((goal) => goal.disciplineDefinitionId)])];
  if (ids.length === 0) return;
  const result = await executor.query<{ id: string; unit: string; precision: number }>('SELECT id, unit, precision FROM discipline_definitions WHERE id = ANY($1::uuid[])', [ids]);
  if (result.rows.length !== ids.length) throw new ApiError(400, 'INVALID_DISCIPLINE_IDS', 'All disciplines must exist in the shared catalogue');
  const definitions = new Map(result.rows.map((definition) => [definition.id, definition]));
  for (const goal of payload.seasonGoals ?? []) {
    const definition = definitions.get(goal.disciplineDefinitionId)!;
    if (definition.unit !== goal.targetUnit) throw new ApiError(400, 'INVALID_GOAL_TARGET', 'Goal target unit must match its discipline');
    if (!hasAllowedPrecision(goal.targetValue, definition.precision)) throw new ApiError(400, 'INVALID_GOAL_TARGET', 'Goal target value exceeds the discipline precision');
  }
}

function hasAllowedPrecision(value: number, precision: number): boolean {
  const scaled = value * 10 ** precision;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

async function replaceDisciplineProfile(athleteId: string, payload: AthleteCreatePayload, executor: DbExecutor): Promise<void> {
  if (payload.preferredDisciplineIds !== undefined) await executor.query('DELETE FROM athlete_preferred_disciplines WHERE athlete_id = $1', [athleteId]);
  if (payload.preferredDisciplineIds?.length) await executor.query(
    'INSERT INTO athlete_preferred_disciplines (athlete_id, discipline_definition_id) SELECT $1, unnest($2::uuid[])',
    [athleteId, payload.preferredDisciplineIds],
  );
  if (payload.seasonGoals === undefined) return;
  const retainedIds = payload.seasonGoals.flatMap((goal) => goal.id ? [goal.id] : []);
  if (retainedIds.length) {
    const existing = await executor.query<{ id: string }>('SELECT id FROM athlete_season_goals WHERE athlete_id = $1 AND id = ANY($2::uuid[])', [athleteId, retainedIds]);
    if (existing.rows.length !== retainedIds.length) throw new ApiError(400, 'INVALID_GOAL_IDS', 'Goals can only be edited on their athlete');
  }
  await executor.query(
    retainedIds.length
      ? 'DELETE FROM athlete_season_goals WHERE athlete_id = $1 AND id <> ALL($2::uuid[])'
      : 'DELETE FROM athlete_season_goals WHERE athlete_id = $1',
    retainedIds.length ? [athleteId, retainedIds] : [athleteId],
  );
  for (const goal of payload.seasonGoals) {
    if (goal.id) await executor.query(
      `UPDATE athlete_season_goals SET discipline_definition_id = $1, target_value = $2, target_unit = $3, target_date = $4, status = $5, updated_at = now()
       WHERE id = $6 AND athlete_id = $7`,
      [goal.disciplineDefinitionId, goal.targetValue, goal.targetUnit, goal.targetDate, goal.status, goal.id, athleteId],
    );
    else await executor.query(
      `INSERT INTO athlete_season_goals (athlete_id, discipline_definition_id, target_value, target_unit, target_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [athleteId, goal.disciplineDefinitionId, goal.targetValue, goal.targetUnit, goal.targetDate, goal.status],
    );
  }
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

export async function setAthleteStatus(
  workspaceId: string,
  actorId: string | null,
  athleteId: unknown,
  status: AthleteLifecycleStatus,
  executor: DbExecutor | undefined = undefined,
): Promise<Athlete> {
  requireScopedId(workspaceId, athleteId);
  if (actorId !== null && !isCanonicalUuid(actorId)) throw notFound();

  const operation = async (client: DbExecutor) => {
    const existing = await client.query<{ lifecycle_status: AthleteLifecycleStatus }>(
      `SELECT lifecycle_status FROM athletes
       WHERE id = $1 AND workspace_id = $2
       FOR UPDATE`,
      [athleteId, workspaceId],
    );
    const current = existing.rows[0];
    if (!current) throw notFound();
    if (current.lifecycle_status === status) return getAthlete(workspaceId, athleteId, client);

    await client.query(
      `UPDATE athletes
       SET lifecycle_status = $1,
           archived_at = CASE WHEN $1 = 'archived' THEN now() ELSE NULL END,
           status_changed_at = now(),
           status_changed_by = $2,
           updated_at = now()
       WHERE id = $3 AND workspace_id = $4`,
      [status, actorId, athleteId, workspaceId],
    );
    const transition = await client.query<{ id: string }>(
      `INSERT INTO athlete_status_transitions (workspace_id, athlete_id, from_status, to_status, changed_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [workspaceId, athleteId, current.lifecycle_status, status, actorId],
    );
    const transitionId = transition.rows[0]?.id;
    if (!transitionId) throw new Error('Athlete lifecycle transition was not recorded');
    await client.query(
      `INSERT INTO event_participant_status_reviews (event_id, athlete_id, transition_id, lifecycle_status)
        SELECT ep.event_id, ep.athlete_id, $1, $2
        FROM event_participants ep
        WHERE ep.athlete_id = $3 AND ep.participant_workspace_id = $4
       ON CONFLICT (event_id, athlete_id) DO UPDATE
       SET transition_id = EXCLUDED.transition_id,
           lifecycle_status = EXCLUDED.lifecycle_status,
           flagged_at = now(),
           acknowledged_at = NULL,
           acknowledged_by = NULL`,
      [transitionId, status, athleteId, workspaceId],
    );
    return getAthlete(workspaceId, athleteId, client);
  };
  return executor ? operation(executor) : withTransaction(operation);
}

/** @deprecated Use setAthleteStatus with the acting workspace member. */
export async function setAthleteArchived(
  workspaceId: string,
  athleteId: unknown,
  archived: boolean,
  executor: DbExecutor = getPool(),
): Promise<Athlete> {
  requireScopedId(workspaceId, athleteId);
  const result = await executor.query<{ id: string }>(
    `UPDATE athletes
     SET lifecycle_status = '${archived ? 'archived' : 'active'}',
         ${archived ? 'archived_at = now()' : 'archived_at = NULL'},
         status_changed_at = now(),
         status_changed_by = NULL,
         updated_at = now()
     WHERE id = $1 AND workspace_id = $2
     RETURNING id`,
    [athleteId, workspaceId],
  );
  if (!result.rows[0]) throw notFound();
  return getAthlete(workspaceId, athleteId, executor);
}
