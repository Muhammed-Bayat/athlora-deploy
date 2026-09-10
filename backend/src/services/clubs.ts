import { getPool, type DbExecutor } from '../db/client.js';
import { withTransaction } from '../db/transaction.js';
import {
  mapClubJoinRequestRow,
  mapClubRow,
  type ClubJoinRequestRow,
  type ClubRow,
} from '../db/row-mappers.js';
import { ApiError } from '../middleware/errors.js';
import {
  DISCIPLINE_100M,
  type AthleteLifecycleStatus,
  type Club,
  type ClubAthleteLookup,
  type ClubComparisonDetail,
  type ClubJoinRequest,
  type ClubStatistics,
} from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';

interface ClubSummaryRow {
  id: string;
  workspace_id: string;
  name: string;
}

interface ClubAthleteLookupRow {
  id: string;
  name: string;
  lifecycle_status: AthleteLifecycleStatus;
}

interface ClubStatisticsRow {
  active_count: number | string;
  inactive_count: number | string;
  archived_count: number | string;
  total_count: number | string;
  distinct_athletes_with_valid_results: number | string;
  total_100m_result_count: number | string;
  valid_100m_result_count: number | string;
  fastest_valid_time: number | string | null;
  latest_valid_time: number | string | null;
  average_valid_time: number | string | null;
  median_valid_time: number | string | null;
  population_standard_deviation: number | string | null;
}

function clubNotFound(): ApiError {
  return new ApiError(404, 'CLUB_NOT_FOUND', 'Club not found');
}

function count(value: number | string): number {
  return Number(value);
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

async function findClub(
  clubId: unknown,
  executor: DbExecutor,
): Promise<ClubStatistics['club'] & { workspaceId: string }> {
  if (!isCanonicalUuid(clubId)) throw clubNotFound();
  const result = await executor.query<ClubSummaryRow>(
    'SELECT id, workspace_id, name FROM clubs WHERE id = $1',
    [clubId],
  );
  const club = result.rows[0];
  if (!club) throw clubNotFound();
  return { id: club.id, name: club.name, workspaceId: club.workspace_id };
}

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

export async function listClubComparisonAthletes(
  clubId: unknown,
  search: string | null,
  executor: DbExecutor = getPool(),
): Promise<ClubAthleteLookup[]> {
  const club = await findClub(clubId, executor);
  const result = await executor.query<ClubAthleteLookupRow>(
    `SELECT a.id, a.name, a.lifecycle_status
     FROM athletes a
     WHERE a.workspace_id = $1
       AND a.lifecycle_status <> 'archived'
       AND ($2::text IS NULL OR a.name ILIKE '%' || $2 || '%')
     ORDER BY lower(a.name), a.created_at, a.id`,
    [club.workspaceId, search],
  );
  return result.rows.map((athlete) => ({
    id: athlete.id,
    name: athlete.name,
    status: athlete.lifecycle_status,
  }));
}

export async function getClubStatistics(
  clubId: unknown,
  executor: DbExecutor = getPool(),
): Promise<ClubStatistics> {
  const club = await findClub(clubId, executor);
  const result = await executor.query<ClubStatisticsRow>(
    `WITH roster AS (
       SELECT a.id, a.lifecycle_status
       FROM athletes a
       WHERE a.workspace_id = $1
     ), effective AS (
       SELECT r.athlete_id,
              e.date AS event_date,
              e.time AS event_time,
              e.created_at AS event_created_at,
              e.id AS event_id,
              CASE
                WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN NULL
                WHEN r.manual_override IS NOT NULL AND r.manual_override > 0
                  THEN r.manual_override
                ELSE r.final_result
              END AS effective_result,
              CASE
                WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN r.outcome
                WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN 'valid'
                ELSE r.outcome
              END AS effective_outcome
       FROM results r
       JOIN roster a ON a.id = r.athlete_id
       JOIN events e ON e.id = r.event_id
       WHERE r.discipline = $2
         AND e.status <> 'cancelled'
         AND (e.workspace_id = $1 OR EXISTS (
           SELECT 1 FROM event_fixture_workspaces fw
           JOIN event_participants ep ON ep.event_id = fw.event_id
             AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
           WHERE fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
             AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
         ))
     ), valid AS (
       SELECT *
       FROM effective
       WHERE effective_outcome = 'valid' AND effective_result IS NOT NULL
     )
     SELECT
       (SELECT COUNT(*) FILTER (WHERE lifecycle_status = 'active') FROM roster) AS active_count,
       (SELECT COUNT(*) FILTER (WHERE lifecycle_status = 'inactive') FROM roster) AS inactive_count,
       (SELECT COUNT(*) FILTER (WHERE lifecycle_status = 'archived') FROM roster) AS archived_count,
       (SELECT COUNT(*) FROM roster) AS total_count,
       (SELECT COUNT(DISTINCT athlete_id) FROM valid) AS distinct_athletes_with_valid_results,
       COUNT(*) AS total_100m_result_count,
       (SELECT COUNT(*) FROM valid) AS valid_100m_result_count,
       (SELECT MIN(effective_result) FROM valid) AS fastest_valid_time,
       (SELECT effective_result FROM valid
        ORDER BY event_date DESC, event_time DESC NULLS LAST, event_created_at DESC, event_id DESC
        LIMIT 1) AS latest_valid_time,
       (SELECT AVG(effective_result) FROM valid) AS average_valid_time,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY effective_result) FROM valid)
         AS median_valid_time,
       CASE WHEN (SELECT COUNT(*) FROM valid) < 2 THEN NULL
            ELSE (SELECT stddev_pop(effective_result) FROM valid)
       END AS population_standard_deviation
     FROM effective`,
    [club.workspaceId, DISCIPLINE_100M],
  );
  const statistics = result.rows[0];
  if (!statistics) throw new Error('Club statistics aggregate query returned no row');

  return {
    club: { id: club.id, name: club.name },
    roster: {
      active: count(statistics.active_count),
      inactive: count(statistics.inactive_count),
      archived: count(statistics.archived_count),
      total: count(statistics.total_count),
    },
    distinctAthletesWithValidResults: count(statistics.distinct_athletes_with_valid_results),
    total100mResultCount: count(statistics.total_100m_result_count),
    valid100mResultCount: count(statistics.valid_100m_result_count),
    fastestValidTime: nullableNumber(statistics.fastest_valid_time),
    latestValidTime: nullableNumber(statistics.latest_valid_time),
    averageValidTime: nullableNumber(statistics.average_valid_time),
    medianValidTime: nullableNumber(statistics.median_valid_time),
    populationStandardDeviation: nullableNumber(statistics.population_standard_deviation),
  };
}

export async function getClubComparison(
  club1Id: unknown,
  club2Id: unknown,
): Promise<ClubComparisonDetail> {
  if (typeof club1Id !== 'string' || typeof club2Id !== 'string') {
    throw new ApiError(400, 'CLUB_IDS_REQUIRED', 'Exactly two club IDs are required');
  }
  if (club1Id === club2Id) {
    throw new ApiError(400, 'DUPLICATE_CLUB_ID', 'Exactly two distinct club IDs are required');
  }

  const club1 = await getClubStatistics(club1Id);
  const club2 = await getClubStatistics(club2Id);
  return { clubs: [club1, club2] };
}

export async function createClub(userId: string, name: string): Promise<Club> {
  try {
    return await withTransaction(async (client) => {
      const existing = await client.query('SELECT 1 FROM workspace_members WHERE user_id = $1', [userId]);
      if (existing.rows[0]) throw new ApiError(409, 'USER_ALREADY_IN_WORKSPACE', 'A user can belong to only one club');
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
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'USER_ALREADY_IN_WORKSPACE', 'A user can belong to only one club');
    }
    throw error;
  }
}

export async function createJoinRequest(clubId: string, userId: string): Promise<ClubJoinRequest> {
  try {
    const membership = await getPool().query('SELECT 1 FROM workspace_members WHERE user_id = $1', [userId]);
    if (membership.rows[0]) throw new ApiError(409, 'USER_ALREADY_IN_WORKSPACE', 'A user can belong to only one club');
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
  try {
    return await withTransaction(async (client) => {
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
      const membership = await client.query('SELECT 1 FROM workspace_members WHERE user_id = $1 FOR UPDATE', [row.user_id]);
      if (membership.rows[0]) throw new ApiError(409, 'USER_ALREADY_IN_WORKSPACE', 'A user can belong to only one club');
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
          VALUES ($1, $2, $3)`,
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
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'USER_ALREADY_IN_WORKSPACE', 'A user can belong to only one club');
    }
    throw error;
  }
}

export async function assertActiveClubWorkspace(clubId: string, workspaceId: string): Promise<void> {
  const result = await getPool().query(
    'SELECT id FROM clubs WHERE id = $1 AND workspace_id = $2',
    [clubId, workspaceId],
  );
  if (!result.rows[0]) throw new ApiError(404, 'CLUB_NOT_FOUND', 'Club not found');
}
