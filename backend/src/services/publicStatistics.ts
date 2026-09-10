import { getPool, type DbExecutor } from '../db/client.js';
import { withReadTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import {
  DISCIPLINE_100M,
  type PublicAthleteStatistics,
  type PublicClub,
  type PublicClubStatistics,
} from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { getClubStatistics } from './clubs.js';

interface PublicClubRow {
  id: string;
  workspace_id: string;
  name: string;
}

interface PublicAthleteStatisticsRow {
  id: string;
  name: string;
  pb: number | string | null;
  latest_effective_result: number | string | null;
  valid_result_count: number | string;
  total_result_count: number | string;
  average: number | string | null;
  consistency: number | string | null;
  earliest_valid_result: number | string | null;
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function rounded(value: number | string | null): number | null {
  const number = nullableNumber(value);
  return number === null ? null : Math.round(number * 100) / 100;
}

async function findPublicClub(clubId: unknown, executor: DbExecutor): Promise<PublicClubRow> {
  if (!isCanonicalUuid(clubId)) throw notFound();
  const result = await executor.query<PublicClubRow>(
    `SELECT id, workspace_id, name
     FROM clubs
     WHERE id = $1 AND public_results_enabled = true`,
    [clubId],
  );
  const club = result.rows[0];
  if (!club) throw notFound();
  return club;
}

function mapPublicAthleteStatistics(row: PublicAthleteStatisticsRow): PublicAthleteStatistics {
  const pb = nullableNumber(row.pb);
  const earliest = nullableNumber(row.earliest_valid_result);
  return {
    athlete: { id: row.id, name: row.name },
    pb,
    latestEffectiveResult: nullableNumber(row.latest_effective_result),
    validResultCount: Number(row.valid_result_count),
    totalResultCount: Number(row.total_result_count),
    average: rounded(row.average),
    consistency: rounded(row.consistency),
    improvement: earliest === null || pb === null || Number(row.valid_result_count) < 2
      ? null
      : Math.round((earliest - pb) * 100) / 100,
  };
}

async function getPublicAthleteStatistics(
  workspaceId: string,
  executor: DbExecutor,
): Promise<PublicAthleteStatistics[]> {
  const result = await executor.query<PublicAthleteStatisticsRow>(
    `WITH effective AS (
       SELECT r.athlete_id,
              e.date AS event_date,
              e.time AS event_time,
              e.created_at AS event_created_at,
              e.id AS event_id,
              CASE
                WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN NULL
                WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN r.manual_override
                ELSE r.final_result
              END AS effective_result,
              CASE
                WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN r.outcome
                WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN 'valid'
                ELSE r.outcome
              END AS effective_outcome
       FROM results r
       JOIN athletes a ON a.id = r.athlete_id
       JOIN events e ON e.id = r.event_id
       WHERE a.workspace_id = $1
         AND a.lifecycle_status <> 'archived'
         AND r.discipline = $2
         AND e.status <> 'cancelled'
         AND (e.workspace_id = $1 OR EXISTS (
           SELECT 1
           FROM event_fixture_workspaces fw
           JOIN event_participants ep ON ep.event_id = fw.event_id
             AND ep.athlete_id = r.athlete_id
             AND ep.participant_workspace_id = fw.workspace_id
           WHERE fw.event_id = e.id
             AND fw.workspace_id = $1
             AND fw.role = 'guest'
             AND fw.status = 'accepted'
             AND fw.accepted_revision = e.fixture_revision
         ))
     ), valid AS (
       SELECT * FROM effective
       WHERE effective_outcome = 'valid' AND effective_result IS NOT NULL
     ), totals AS (
       SELECT athlete_id, COUNT(*) AS total_result_count
       FROM effective
       GROUP BY athlete_id
     ), metrics AS (
       SELECT athlete_id,
              MIN(effective_result) AS pb,
              (ARRAY_AGG(effective_result ORDER BY event_date DESC, event_time DESC NULLS LAST, event_created_at DESC, event_id DESC))[1] AS latest_effective_result,
              COUNT(*) AS valid_result_count,
              AVG(effective_result) AS average,
              CASE WHEN COUNT(*) < 2 THEN NULL ELSE STDDEV_POP(effective_result) END AS consistency,
              (ARRAY_AGG(effective_result ORDER BY event_date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC))[1] AS earliest_valid_result
       FROM valid
       GROUP BY athlete_id
     )
     SELECT a.id,
            a.name,
            m.pb,
            m.latest_effective_result,
            COALESCE(m.valid_result_count, 0) AS valid_result_count,
            COALESCE(t.total_result_count, 0) AS total_result_count,
            m.average,
            m.consistency,
            m.earliest_valid_result
     FROM athletes a
     LEFT JOIN totals t ON t.athlete_id = a.id
     LEFT JOIN metrics m ON m.athlete_id = a.id
     WHERE a.workspace_id = $1 AND a.lifecycle_status <> 'archived'
     ORDER BY m.pb ASC NULLS LAST, lower(a.name), a.id`,
    [workspaceId, DISCIPLINE_100M],
  );
  return result.rows.map(mapPublicAthleteStatistics);
}

export async function listPublicClubs(search: string | null): Promise<PublicClub[]> {
  const result = await getPool().query<PublicClubRow>(
    `SELECT id, workspace_id, name
     FROM clubs
     WHERE public_results_enabled = true
       AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
     ORDER BY lower(name), id
     LIMIT 100`,
    [search],
  );
  return result.rows.map(({ id, name }) => ({ id, name }));
}

export async function getPublicClubStatistics(clubId: unknown): Promise<PublicClubStatistics> {
  return withReadTransaction(async (client) => {
    const club = await findPublicClub(clubId, client);
    const statistics = await getClubStatistics(club.id, client);
    const athletes = await getPublicAthleteStatistics(club.workspace_id, client);
    return { ...statistics, club: { id: club.id, name: club.name }, athletes };
  });
}
