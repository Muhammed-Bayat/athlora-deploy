import { getPool, type DbExecutor } from '../db/client.js';
import { withReadTransaction } from '../db/transaction.js';
import { ApiError } from '../middleware/errors.js';
import {
  DISCIPLINE_100M,
  type PublicAthleteStatistics,
  type PublicAthleteComparison,
  type PublicAthleteComparisonEntry,
  type PublicAthleteComparisonAthlete,
  type PublicClub,
  type PublicClubStatistics,
} from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { getClubStatistics } from './clubs.js';
import { parseSeasonYear, type SeasonScope } from './seasons.js';

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

export async function listPublicSeasons(executor: DbExecutor = getPool(), now = new Date()): Promise<number[]> {
  const result = await executor.query<{ year: number | string }>(
    `SELECT DISTINCT EXTRACT(YEAR FROM e.date)::integer AS year
     FROM events e
     JOIN clubs c ON c.workspace_id = e.workspace_id
     WHERE c.public_results_enabled = true
     UNION
     SELECT $1::integer
     ORDER BY year DESC`,
    [now.getUTCFullYear()],
  );
  return result.rows.map((row) => Number(row.year));
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
  season: SeasonScope,
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
          AND e.date >= $3::date AND e.date < $4::date
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
    [workspaceId, DISCIPLINE_100M, season.selected === 'all' ? '0001-01-01' : season.startDate!, season.selected === 'all' ? '9999-12-31' : season.endDate!],
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

export async function getPublicClubStatistics(clubId: unknown, season: SeasonScope = parseSeasonYear(undefined)): Promise<PublicClubStatistics> {
  return withReadTransaction(async (client) => {
    const club = await findPublicClub(clubId, client);
    const statistics = await getClubStatistics(club.id, client, season);
    const athletes = await getPublicAthleteStatistics(club.workspace_id, client, season);
    return { ...statistics, club: { id: club.id, name: club.name }, athletes };
  });
}

function validateComparisonAthleteIds(athleteIds: unknown): string[] {
  if (!Array.isArray(athleteIds)
    || athleteIds.length < 2
    || athleteIds.length > 5
    || !athleteIds.every(isCanonicalUuid)
    || new Set(athleteIds).size !== athleteIds.length) {
    throw new ApiError(422, 'ATHLETE_IDS_INVALID', 'Select two to five unique athlete IDs');
  }
  return athleteIds;
}

async function getPublicAthleteProgression(
  athleteId: string,
  workspaceId: string,
  executor: DbExecutor,
  season: SeasonScope,
): Promise<PublicAthleteComparisonEntry[]> {
  const result = await executor.query<{ date: string; result: number | string }>(
    `SELECT e.date::text AS date,
            CASE
              WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN r.manual_override
              ELSE r.final_result
            END AS result
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.athlete_id = $1
       AND r.discipline = $2
       AND r.outcome NOT IN ('dq', 'dnf', 'dns')
       AND e.status <> 'cancelled'
       AND e.date >= $3::date AND e.date < $4::date
       AND (e.workspace_id = $5 OR EXISTS (
         SELECT 1
         FROM event_fixture_workspaces fw
         JOIN event_participants ep ON ep.event_id = fw.event_id
           AND ep.athlete_id = r.athlete_id
           AND ep.participant_workspace_id = fw.workspace_id
         WHERE fw.event_id = e.id
           AND fw.workspace_id = $5
           AND fw.role = 'guest'
           AND fw.status = 'accepted'
           AND fw.accepted_revision = e.fixture_revision
       ))
       AND (r.manual_override IS NOT NULL AND r.manual_override > 0 OR r.final_result IS NOT NULL)
     ORDER BY e.date ASC, e.time ASC NULLS LAST, e.created_at ASC, e.id ASC`,
    [athleteId, DISCIPLINE_100M, season.selected === 'all' ? '0001-01-01' : season.startDate!, season.selected === 'all' ? '9999-12-31' : season.endDate!, workspaceId],
  );
  return result.rows.map((row) => ({ date: row.date, result: Number(row.result) }));
}

export async function getPublicAthleteComparison(
  athleteIds: unknown,
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<PublicAthleteComparison> {
  const ids = validateComparisonAthleteIds(athleteIds);
  return withReadTransaction(async (client) => {
    const result = await client.query<{ id: string; workspace_id: string; name: string; club_id: string; club_name: string }>(
      `SELECT a.id, a.workspace_id, a.name, c.id AS club_id, c.name AS club_name
       FROM athletes a
       JOIN clubs c ON c.workspace_id = a.workspace_id
       WHERE a.id = ANY($1::uuid[])
         AND a.lifecycle_status <> 'archived'
         AND c.public_results_enabled = true`,
      [ids],
    );
    if (result.rows.length !== ids.length) throw notFound();
    const athletesById = new Map(result.rows.map((athlete) => [athlete.id, athlete]));
    const selected = ids.map((id) => athletesById.get(id)!);
    if (new Set(selected.map((athlete) => athlete.workspace_id)).size !== ids.length) {
      throw new ApiError(422, 'CROSS_CLUB_COMPARISON_REQUIRES_DISTINCT_CLUBS', 'Select athletes from different published clubs');
    }

    const athletes = await Promise.all(selected.map(async (selectedAthlete): Promise<PublicAthleteComparisonAthlete> => {
      const statistics = await getPublicAthleteStatistics(selectedAthlete.workspace_id, client, season);
      const athlete = statistics.find((entry) => entry.athlete.id === selectedAthlete.id);
      if (!athlete) throw notFound();
      return {
        ...athlete,
        club: { id: selectedAthlete.club_id, name: selectedAthlete.club_name },
        progression: await getPublicAthleteProgression(selectedAthlete.id, selectedAthlete.workspace_id, client, season),
      };
    }));
    return { athletes };
  });
}
