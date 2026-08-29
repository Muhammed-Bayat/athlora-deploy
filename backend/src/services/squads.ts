import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { Squad } from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';

interface SquadRow {
  id: string;
  name: string;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function notFound(): ApiError { return new ApiError(404, 'NOT_FOUND', 'Resource not found'); }
function timestamp(value: Date | string | null): string | null {
  return value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function map(row: SquadRow): Squad {
  return { id: row.id, name: row.name, archivedAt: timestamp(row.archived_at), createdAt: timestamp(row.created_at)!, updatedAt: timestamp(row.updated_at)! };
}
function scoped(workspaceId: string, id?: unknown): asserts id is string | undefined {
  if (!isCanonicalUuid(workspaceId) || (id !== undefined && !isCanonicalUuid(id))) throw notFound();
}

export async function listSquads(workspaceId: string, includeArchived: boolean, executor: DbExecutor = getPool()): Promise<Squad[]> {
  scoped(workspaceId);
  const result = await executor.query<SquadRow>(`SELECT id, name, archived_at, created_at, updated_at FROM squads WHERE workspace_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY lower(name), created_at, id`, [workspaceId]);
  return result.rows.map(map);
}
export async function createSquad(workspaceId: string, name: string, executor: DbExecutor = getPool()): Promise<Squad> {
  scoped(workspaceId);
  try {
    const result = await executor.query<SquadRow>('INSERT INTO squads (workspace_id, name) VALUES ($1, $2) RETURNING id, name, archived_at, created_at, updated_at', [workspaceId, name]);
    return map(result.rows[0]);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'SQUAD_NAME_EXISTS', 'A squad with this name already exists');
    throw error;
  }
}
export async function replaceSquad(workspaceId: string, squadId: unknown, name: string, executor: DbExecutor = getPool()): Promise<Squad> {
  scoped(workspaceId, squadId);
  try {
    const result = await executor.query<SquadRow>('UPDATE squads SET name = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3 RETURNING id, name, archived_at, created_at, updated_at', [name, squadId, workspaceId]);
    if (!result.rows[0]) throw notFound();
    return map(result.rows[0]);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'SQUAD_NAME_EXISTS', 'A squad with this name already exists');
    throw error;
  }
}
export async function setSquadArchived(workspaceId: string, squadId: unknown, archived: boolean, executor: DbExecutor = getPool()): Promise<Squad> {
  scoped(workspaceId, squadId);
  const result = await executor.query<SquadRow>(`UPDATE squads SET archived_at = ${archived ? 'now()' : 'NULL'}, updated_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING id, name, archived_at, created_at, updated_at`, [squadId, workspaceId]);
  if (!result.rows[0]) throw notFound();
  return map(result.rows[0]);
}
