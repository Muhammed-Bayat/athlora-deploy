import { getPool } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
  role: 'coach' | 'assistant' | 'viewer';
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const result = await getPool().query<Workspace>(
    `SELECT w.id, w.name, w.timezone, wm.role
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
     ORDER BY w.created_at, w.id`,
    [userId],
  );
  return result.rows;
}

export async function resolveWorkspace(userId: string, requestedWorkspaceId: unknown): Promise<Workspace> {
  const result = await getPool().query<Workspace>(
    `SELECT w.id, w.name, w.timezone, wm.role
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
       AND ($2::uuid IS NULL OR w.id = $2::uuid)
     ORDER BY w.created_at, w.id
     LIMIT 1`,
    [userId, typeof requestedWorkspaceId === 'string' ? requestedWorkspaceId : null],
  );
  const workspace = result.rows[0];
  if (!workspace) throw new ApiError(403, 'WORKSPACE_ACCESS_DENIED', 'Workspace access is not available');
  return workspace;
}
