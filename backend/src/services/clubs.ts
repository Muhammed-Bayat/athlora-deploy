import { getPool } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import {
  mapClubJoinRequestRow,
  mapClubRow,
  type ClubJoinRequestRow,
  type ClubRow,
} from '../db/row-mappers.js';
import { ApiError } from '../middleware/errors.js';
import type { Club, ClubJoinRequest } from '../types/domain.js';

export async function listClubs(search: string | null): Promise<Club[]> {
  const result = await getPool().query<ClubRow>(
    `SELECT id, workspace_id, name, created_at, updated_at
     FROM clubs
     WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
     ORDER BY name, id`,
    [search],
  );
  return result.rows.map(mapClubRow);
}

export async function createClub(userId: string, name: string): Promise<Club> {
  return withTransaction(async (client) => {
    const workspace = await client.query<{ id: string }>(
      'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
      [name],
    );
    const workspaceId = workspace.rows[0]?.id;
    if (!workspaceId) throw new ApiError(500, 'CLUB_CREATE_FAILED', 'Could not create club workspace');
    const club = await client.query<ClubRow>(
      `INSERT INTO clubs (workspace_id, name)
       VALUES ($1, $2)
       RETURNING id, workspace_id, name, created_at, updated_at`,
      [workspaceId, name],
    );
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'coach')",
      [workspaceId, userId],
    );
    return mapClubRow(club.rows[0]!);
  });
}

export async function createJoinRequest(clubId: string, userId: string): Promise<ClubJoinRequest> {
  try {
    const result = await getPool().query<ClubJoinRequestRow>(
      `INSERT INTO club_join_requests (club_id, user_id)
       SELECT $1, $2
       WHERE EXISTS (SELECT 1 FROM clubs WHERE id = $1)
       RETURNING id, club_id, user_id, status, reviewed_by, reviewed_at, created_at, updated_at`,
      [clubId, userId],
    );
    if (!result.rows[0]) throw new ApiError(404, 'CLUB_NOT_FOUND', 'Club not found');
    return mapClubJoinRequestRow(result.rows[0]);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'CLUB_JOIN_REQUEST_EXISTS', 'A join request is already pending');
    }
    throw error;
  }
}

export async function listMyJoinRequests(userId: string): Promise<ClubJoinRequest[]> {
  const result = await getPool().query<ClubJoinRequestRow>(
    `SELECT r.id, r.club_id, r.user_id, r.status, r.reviewed_by, r.reviewed_at, r.created_at, r.updated_at,
            c.name AS club_name
     FROM club_join_requests r
     JOIN clubs c ON c.id = r.club_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC, r.id DESC`,
    [userId],
  );
  return result.rows.map(mapClubJoinRequestRow);
}

export async function withdrawJoinRequest(requestId: string, userId: string): Promise<void> {
  const result = await getPool().query(
    `UPDATE club_join_requests
     SET status = 'withdrawn', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING id`,
    [requestId, userId],
  );
  if (!result.rows[0]) throw new ApiError(404, 'CLUB_JOIN_REQUEST_NOT_FOUND', 'Join request not found');
}

export async function listClubJoinRequests(clubId: string): Promise<ClubJoinRequest[]> {
  const result = await getPool().query<ClubJoinRequestRow>(
    `SELECT r.id, r.club_id, r.user_id, r.status, r.reviewed_by, r.reviewed_at, r.created_at, r.updated_at,
            u.name AS user_name, u.email AS user_email
     FROM club_join_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.club_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at, r.id`,
    [clubId],
  );
  return result.rows.map(mapClubJoinRequestRow);
}

export async function reviewJoinRequest(
  clubId: string,
  requestId: string,
  actorId: string,
  decision: 'approved' | 'rejected',
  role?: 'coach' | 'assistant',
): Promise<ClubJoinRequest> {
  return withTransaction(async (client) => {
    const request = await client.query<ClubJoinRequestRow & { workspace_id: string }>(
      `SELECT r.id, r.club_id, r.user_id, r.status, r.reviewed_by, r.reviewed_at, r.created_at, r.updated_at, c.workspace_id
       FROM club_join_requests r
       JOIN clubs c ON c.id = r.club_id
       WHERE r.id = $1 AND r.club_id = $2 AND r.status = 'pending'
       FOR UPDATE`,
      [requestId, clubId],
    );
    const row = request.rows[0];
    if (!row) throw new ApiError(404, 'CLUB_JOIN_REQUEST_NOT_FOUND', 'Join request not found');
    if (decision === 'approved') {
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
        [row.workspace_id, row.user_id, role],
      );
    }
    const reviewed = await client.query<ClubJoinRequestRow>(
      `UPDATE club_join_requests
       SET status = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING id, club_id, user_id, status, reviewed_by, reviewed_at, created_at, updated_at`,
      [requestId, decision, actorId],
    );
    return mapClubJoinRequestRow(reviewed.rows[0]!);
  });
}

export async function assertActiveClubWorkspace(clubId: string, workspaceId: string): Promise<void> {
  const result = await getPool().query(
    'SELECT id FROM clubs WHERE id = $1 AND workspace_id = $2',
    [clubId, workspaceId],
  );
  if (!result.rows[0]) throw new ApiError(404, 'CLUB_NOT_FOUND', 'Club not found');
}
