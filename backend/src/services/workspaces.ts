import { getPool } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import { createHash, randomBytes } from 'node:crypto';

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

export interface WorkspaceMember { userId: string; name: string; email: string; role: 'coach' | 'assistant'; createdAt: string; }
export interface WorkspaceInvitation { id: string; email: string; role: 'coach' | 'assistant'; expiresAt: string; createdAt: string; }
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const result = await getPool().query<WorkspaceMember>(`SELECT u.id AS "userId", u.name, u.email, wm.role, wm.created_at AS "createdAt" FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = $1 ORDER BY wm.created_at, u.id`, [workspaceId]);
  return result.rows;
}

export async function createInvitation(workspaceId: string, actorId: string, email: string, role: 'coach' | 'assistant', expiresInDays = 7): Promise<WorkspaceInvitation & { token: string }> {
  const token = randomBytes(32).toString('base64url');
  return withTransaction(async (client) => {
    const inserted = await client.query<WorkspaceInvitation>(`INSERT INTO workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at) VALUES ($1, lower($2), $3, $4, $5, now() + ($6 * interval '1 day')) RETURNING id, email, role, expires_at AS "expiresAt", created_at AS "createdAt"`, [workspaceId, email, role, hashToken(token), actorId, expiresInDays]);
    const invitation = inserted.rows[0];
    await client.query(`INSERT INTO workspace_membership_audit (workspace_id, actor_id, invitation_id, action, role) VALUES ($1, $2, $3, 'invited', $4)`, [workspaceId, actorId, invitation.id, role]);
    return { ...invitation, token };
  });
}

export async function listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
  const result = await getPool().query<WorkspaceInvitation>(
    `SELECT id, email, role, expires_at AS "expiresAt", created_at AS "createdAt"
     FROM workspace_invitations
     WHERE workspace_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC, id DESC`,
    [workspaceId],
  );
  return result.rows;
}

export async function resendInvitation(workspaceId: string, invitationId: string, actorId: string): Promise<WorkspaceInvitation & { token: string }> {
  const token = randomBytes(32).toString('base64url');
  return withTransaction(async (client) => {
    const existing = await client.query<{ email: string; role: 'coach' | 'assistant' }>(
      `SELECT email, role FROM workspace_invitations
       WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [invitationId, workspaceId],
    );
    const invitation = existing.rows[0];
    if (!invitation) throw new ApiError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
    await client.query('UPDATE workspace_invitations SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [invitationId, actorId]);
    const inserted = await client.query<WorkspaceInvitation>(
      `INSERT INTO workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
       RETURNING id, email, role, expires_at AS "expiresAt", created_at AS "createdAt"`,
      [workspaceId, invitation.email, invitation.role, hashToken(token), actorId],
    );
    const replacement = inserted.rows[0];
    await client.query(`INSERT INTO workspace_membership_audit (workspace_id, actor_id, invitation_id, action, role) VALUES ($1, $2, $3, 'resent', $4)`, [workspaceId, actorId, replacement.id, replacement.role]);
    return { ...replacement, token };
  });
}

export async function acceptInvitation(token: string, auth0Id: string): Promise<Workspace> {
  try {
    return await withTransaction(async (client) => {
    const invitation = await client.query<{ id: string; workspace_id: string; email: string; role: 'coach' | 'assistant'; name: string; timezone: string }>(`SELECT i.id, i.workspace_id, i.email, i.role, w.name, w.timezone FROM workspace_invitations i JOIN workspaces w ON w.id = i.workspace_id WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now() FOR UPDATE`, [hashToken(token)]);
    const row = invitation.rows[0];
    if (!row) throw new ApiError(410, 'INVITATION_UNAVAILABLE', 'Invitation is expired, revoked, or already accepted');
    const user = await client.query<{ id: string; email: string }>('SELECT id, email FROM users WHERE auth0_id = $1 FOR UPDATE', [auth0Id]);
    if (!user.rows[0]) throw new ApiError(403, 'AUTH_USER_NOT_SYNCHRONIZED', 'Authenticated user is not synchronized');
    if (user.rows[0].email.toLowerCase() !== row.email.toLowerCase()) throw new ApiError(403, 'INVITATION_EMAIL_MISMATCH', 'Invitation is for a different email address');
    const membership = await client.query('SELECT 1 FROM workspace_members WHERE user_id = $1 FOR UPDATE', [user.rows[0].id]);
    if (membership.rows[0]) throw new ApiError(409, 'USER_ALREADY_IN_WORKSPACE', 'A user can belong to only one club');
    await client.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)`, [row.workspace_id, user.rows[0].id, row.role]);
    await client.query(`UPDATE workspace_invitations SET accepted_at = now(), accepted_by = $1 WHERE id = $2`, [user.rows[0].id, row.id]);
    await client.query(`INSERT INTO workspace_membership_audit (workspace_id, user_id, actor_id, invitation_id, action, role) VALUES ($1, $2, $2, $3, 'accepted', $4)`, [row.workspace_id, user.rows[0].id, row.id, row.role]);
      return { id: row.workspace_id, name: row.name, timezone: row.timezone, role: row.role };
    });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'USER_ALREADY_IN_WORKSPACE', 'A user can belong to only one club');
    }
    throw error;
  }
}

export async function revokeInvitation(workspaceId: string, invitationId: string, actorId: string): Promise<void> {
  const result = await getPool().query(`UPDATE workspace_invitations SET revoked_at = now(), revoked_by = $1 WHERE id = $2 AND workspace_id = $3 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id, role`, [actorId, invitationId, workspaceId]);
  if (!result.rows[0]) throw new ApiError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
  await getPool().query(`INSERT INTO workspace_membership_audit (workspace_id, actor_id, invitation_id, action, role) VALUES ($1, $2, $3, 'revoked', $4)`, [workspaceId, actorId, invitationId, result.rows[0].role]);
}

export async function removeMember(workspaceId: string, userId: string, actorId: string): Promise<void> {
  await withTransaction(async (client) => {
    const member = await client.query<{ role: 'coach' | 'assistant' }>('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE', [workspaceId, userId]);
    if (!member.rows[0]) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    if (member.rows[0].role === 'coach') {
      const members = await client.query<{ user_id: string; role: string }>(`SELECT user_id, role FROM workspace_members WHERE workspace_id = $1 FOR UPDATE`, [workspaceId]);
      if (members.rows.filter((row) => row.role === 'coach').length <= 1) throw new ApiError(409, 'LAST_COACH_REQUIRED', 'A workspace must retain a coach');
    }
    await client.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
    await client.query(`INSERT INTO workspace_membership_audit (workspace_id, user_id, actor_id, action, role) VALUES ($1, $2, $3, 'removed', $4)`, [workspaceId, userId, actorId, member.rows[0].role]);
  });
}

export async function changeMemberRole(
  workspaceId: string,
  userId: string,
  role: 'coach' | 'assistant',
  actorId: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const member = await client.query<{ role: 'coach' | 'assistant' }>(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE',
      [workspaceId, userId],
    );
    if (!member.rows[0]) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found');
    if (member.rows[0].role === 'coach' && role === 'assistant') {
      const coaches = await client.query<{ user_id: string }>(
        "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'coach' FOR UPDATE",
        [workspaceId],
      );
      if (coaches.rows.length <= 1) throw new ApiError(409, 'LAST_COACH_REQUIRED', 'A workspace must retain a coach');
    }
    await client.query(
      'UPDATE workspace_members SET role = $3, updated_at = now() WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, userId, role],
    );
    await client.query(
      "INSERT INTO workspace_membership_audit (workspace_id, user_id, actor_id, action, role) VALUES ($1, $2, $3, 'role_changed', $4)",
      [workspaceId, userId, actorId, role],
    );
  });
}
