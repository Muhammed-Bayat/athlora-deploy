import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { mapAthleteInjuryRow, type AthleteInjuryRow } from '../db/row-mappers.js';
import type { AthleteInjury, InjuryRegion, InjurySide, InjurySeverity } from '../types/domain.js';
import { INJURY_REGIONS } from '../types/domain.js';
import { assertAthleteOwnership } from './ownership.js';

export interface InjuryCreatePayload {
  bodyRegion: InjuryRegion;
  area: string;
  side: InjurySide;
  severity: InjurySeverity;
  notes: string | null;
  occurrenceDate: string;
  expectedReturnDate: string | null;
}

export interface InjuryUpdatePayload {
  bodyRegion?: InjuryRegion;
  area?: string;
  side?: InjurySide;
  severity?: InjurySeverity;
  notes?: string | null;
  occurrenceDate?: string;
  expectedReturnDate?: string | null;
}

export interface InjuryResolvePayload {
  resolvedDate?: string | null;
  resolutionNotes?: string | null;
}

export interface InjuryListQuery {
  includeDeleted?: boolean;
  status?: 'active' | 'resolved' | 'all';
  severity?: InjurySeverity;
}

async function assertNotArchived(workspaceId: string, athleteId: string, executor: DbExecutor): Promise<void> {
  const result = await executor.query<{ archived_at: Date | string | null }>(
    'SELECT archived_at FROM athletes WHERE id = $1 AND workspace_id = $2 LIMIT 1',
    [athleteId, workspaceId],
  );
  if (result.rows[0]?.archived_at !== null) {
    throw new ApiError(409, 'ATHLETE_ARCHIVED', 'Archived athletes are read-only');
  }
}

export async function assertInjuryOwnership(
  workspaceId: string,
  athleteId: string,
  injuryId: string,
  executor: DbExecutor = getPool(),
): Promise<void> {
  await assertAthleteOwnership(workspaceId, athleteId, executor);
  const result = await executor.query<{ id: string }>(
    'SELECT id FROM athlete_injuries WHERE id = $1 AND athlete_id = $2 AND workspace_id = $3 LIMIT 1',
    [injuryId, athleteId, workspaceId],
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  }
}

export async function listInjuries(
  workspaceId: string,
  athleteId: string,
  query: InjuryListQuery = {},
  executor: DbExecutor = getPool(),
): Promise<AthleteInjury[]> {
  await assertAthleteOwnership(workspaceId, athleteId, executor);

  const conditions = ['workspace_id = $1', 'athlete_id = $2'];
  const params: unknown[] = [workspaceId, athleteId];

  if (!query.includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  if (query.status === 'active') {
    conditions.push('resolved_date IS NULL');
  } else if (query.status === 'resolved') {
    conditions.push('resolved_date IS NOT NULL');
  }

  if (query.severity) {
    params.push(query.severity);
    conditions.push(`severity = $${params.length}`);
  }

  const result = await executor.query<AthleteInjuryRow>(
    `SELECT * FROM athlete_injuries WHERE ${conditions.join(' AND ')} ORDER BY occurrence_date DESC, created_at DESC`,
    params,
  );

  return result.rows.map(mapAthleteInjuryRow);
}

export async function createInjury(
  workspaceId: string,
  athleteId: string,
  userId: string,
  payload: InjuryCreatePayload,
  executor: DbExecutor = getPool(),
): Promise<AthleteInjury> {
  await assertAthleteOwnership(workspaceId, athleteId, executor);
  await assertNotArchived(workspaceId, athleteId, executor);

  const allowedAreas = INJURY_REGIONS[payload.bodyRegion as InjuryRegion] as readonly string[];
  if (!allowedAreas || !allowedAreas.includes(payload.area)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid area for specified body region');
  }

  const result = await executor.query<AthleteInjuryRow>(
    `INSERT INTO athlete_injuries (
       workspace_id, athlete_id, body_region, area, side, severity, notes,
       occurrence_date, expected_return_date, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING *`,
    [
      workspaceId,
      athleteId,
      payload.bodyRegion,
      payload.area,
      payload.side,
      payload.severity,
      payload.notes,
      payload.occurrenceDate,
      payload.expectedReturnDate,
      userId,
    ],
  );

  return mapAthleteInjuryRow(result.rows[0]);
}

export async function updateInjury(
  workspaceId: string,
  athleteId: string,
  injuryId: string,
  userId: string,
  payload: InjuryUpdatePayload,
  executor: DbExecutor = getPool(),
): Promise<AthleteInjury> {
  await assertInjuryOwnership(workspaceId, athleteId, injuryId, executor);
  await assertNotArchived(workspaceId, athleteId, executor);

  const existingRes = await executor.query<AthleteInjuryRow>(
    'SELECT * FROM athlete_injuries WHERE id = $1 AND workspace_id = $2 LIMIT 1',
    [injuryId, workspaceId],
  );
  const current = existingRes.rows[0];

  const bodyRegion = payload.bodyRegion ?? (current.body_region as InjuryRegion);
  const area = payload.area ?? current.area;

  const allowedAreas = INJURY_REGIONS[bodyRegion] as readonly string[];
  if (!allowedAreas || !allowedAreas.includes(area)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid area for specified body region');
  }

  const result = await executor.query<AthleteInjuryRow>(
    `UPDATE athlete_injuries
     SET body_region = COALESCE($1, body_region),
         area = COALESCE($2, area),
         side = COALESCE($3, side),
         severity = COALESCE($4, severity),
         notes = CASE WHEN $5::boolean THEN $6 ELSE notes END,
         occurrence_date = COALESCE($7, occurrence_date),
         expected_return_date = CASE WHEN $8::boolean THEN $9 ELSE expected_return_date END,
         updated_by = $10,
         updated_at = now()
     WHERE id = $11 AND workspace_id = $12
     RETURNING *`,
    [
      payload.bodyRegion ?? null,
      payload.area ?? null,
      payload.side ?? null,
      payload.severity ?? null,
      payload.notes !== undefined,
      payload.notes ?? null,
      payload.occurrenceDate ?? null,
      payload.expectedReturnDate !== undefined,
      payload.expectedReturnDate ?? null,
      userId,
      injuryId,
      workspaceId,
    ],
  );

  return mapAthleteInjuryRow(result.rows[0]);
}

export async function resolveInjury(
  workspaceId: string,
  athleteId: string,
  injuryId: string,
  userId: string,
  payload: InjuryResolvePayload,
  executor: DbExecutor = getPool(),
): Promise<AthleteInjury> {
  await assertInjuryOwnership(workspaceId, athleteId, injuryId, executor);
  await assertNotArchived(workspaceId, athleteId, executor);

  const resolvedDate = payload.resolvedDate ?? new Date().toISOString();

  const result = await executor.query<AthleteInjuryRow>(
    `UPDATE athlete_injuries
     SET resolved_date = $1,
         resolution_notes = CASE WHEN $2::boolean THEN $3 ELSE resolution_notes END,
         updated_by = $4,
         updated_at = now()
     WHERE id = $5 AND workspace_id = $6
     RETURNING *`,
    [
      resolvedDate,
      payload.resolutionNotes !== undefined,
      payload.resolutionNotes ?? null,
      userId,
      injuryId,
      workspaceId,
    ],
  );

  return mapAthleteInjuryRow(result.rows[0]);
}

export async function reopenInjury(
  workspaceId: string,
  athleteId: string,
  injuryId: string,
  userId: string,
  executor: DbExecutor = getPool(),
): Promise<AthleteInjury> {
  await assertInjuryOwnership(workspaceId, athleteId, injuryId, executor);
  await assertNotArchived(workspaceId, athleteId, executor);

  const result = await executor.query<AthleteInjuryRow>(
    `UPDATE athlete_injuries
     SET resolved_date = NULL,
         resolution_notes = NULL,
         updated_by = $1,
         updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING *`,
    [userId, injuryId, workspaceId],
  );

  return mapAthleteInjuryRow(result.rows[0]);
}

export async function deleteInjury(
  workspaceId: string,
  athleteId: string,
  injuryId: string,
  userId: string,
  executor: DbExecutor = getPool(),
): Promise<AthleteInjury> {
  await assertInjuryOwnership(workspaceId, athleteId, injuryId, executor);
  await assertNotArchived(workspaceId, athleteId, executor);

  const result = await executor.query<AthleteInjuryRow>(
    `UPDATE athlete_injuries
     SET deleted_at = now(),
         deleted_by = $1,
         updated_by = $1,
         updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING *`,
    [userId, injuryId, workspaceId],
  );

  return mapAthleteInjuryRow(result.rows[0]);
}
