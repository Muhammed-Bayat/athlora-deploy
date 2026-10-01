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
  type PublicAthleteDisciplineStatistics,
} from '../types/domain.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { getClubStatistics } from './clubs.js';
import { publicMediaPath } from './mediaStorage.js';
import { parseSeasonYear, type SeasonScope } from './seasons.js';
import { getPublicStatisticsReport, type PublicStatisticsReportEntry } from './publicStatisticsReport.js';
import { listAvailableDisciplines, SUPPORTED_DISCIPLINE_SQL_LIST } from './disciplineCatalog.js';

interface PublicClubRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  primary_color: string | null;
  logo_key: string | null;
  cover_key: string | null;
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

function dateText(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

async function findPublicClub(clubId: unknown, executor: DbExecutor): Promise<PublicClubRow> {
  if (!isCanonicalUuid(clubId)) throw notFound();
  const result = await executor.query<PublicClubRow>(
    `SELECT id, workspace_id, name, description, primary_color, logo_key, cover_key
     FROM clubs
     WHERE id = $1 AND public_results_enabled = true`,
    [clubId],
  );
  const club = result.rows[0];
  if (!club) throw notFound();
  return club;
}

function publicBrandSummary(row: PublicClubRow) {
  return {
    description: row.description,
    primaryColor: row.primary_color,
    logoUrl: row.logo_key ? publicMediaPath(row.workspace_id, row.logo_key) : null,
    coverUrl: row.cover_key ? publicMediaPath(row.workspace_id, row.cover_key) : null,
  };
}

function mapPublicAthleteStatistics(row: PublicAthleteStatisticsRow, disciplines: PublicAthleteDisciplineStatistics[]): PublicAthleteStatistics {
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
    disciplines,
  };
}

function disciplineStatistics(entries: PublicStatisticsReportEntry[]): Map<string, PublicAthleteDisciplineStatistics[]> {
  const byAthlete = new Map<string, Map<string, PublicStatisticsReportEntry[]>>();
  for (const entry of entries) {
    const disciplines = byAthlete.get(entry.athleteId) ?? new Map<string, PublicStatisticsReportEntry[]>();
    disciplines.set(entry.discipline, [...(disciplines.get(entry.discipline) ?? []), entry]);
    byAthlete.set(entry.athleteId, disciplines);
  }
  return new Map([...byAthlete].map(([athleteId, disciplines]) => [athleteId, [...disciplines.values()].map((results) => {
    const first = results[0]!;
    const ordered = [...results].sort((left, right) => dateText(left.eventDate).localeCompare(dateText(right.eventDate)));
    const values = results.map((result) => result.performance);
    const pb = first.direction === 'lower' ? Math.min(...values) : Math.max(...values);
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
    const improvement = values.length < 2 ? null : first.direction === 'lower' ? ordered[0]!.performance - pb : pb - ordered[0]!.performance;
    return {
      discipline: first.discipline, label: first.label, unit: first.unit, precision: first.precision, direction: first.direction,
      pb, latestEffectiveResult: ordered[ordered.length - 1]!.performance, validResultCount: values.length,
      average: Math.round(average * 100) / 100, consistency: values.length < 2 ? null : Math.round(Math.sqrt(variance) * 100) / 100,
      improvement: improvement === null ? null : Math.round(improvement * 100) / 100,
      progression: ordered.map((result) => ({ date: dateText(result.eventDate), result: result.performance })),
    };
  })]));
}

async function preferredDisciplinesByAthlete(workspaceId: string, executor: DbExecutor): Promise<Map<string, PublicAthleteDisciplineStatistics[]>> {
  const result = await executor.query<{
    athlete_id: string; code: string; label: string; unit: PublicAthleteDisciplineStatistics['unit']; precision: number | string; direction: PublicAthleteDisciplineStatistics['direction'];
  }>(`SELECT preferences.athlete_id, definitions.code, definitions.presentation->>'label' AS label, definitions.unit, definitions.precision, definitions.direction
      FROM athlete_preferred_disciplines preferences
      JOIN athletes athletes ON athletes.id = preferences.athlete_id
      JOIN discipline_definitions definitions ON definitions.id = preferences.discipline_definition_id
      WHERE athletes.workspace_id = $1 AND athletes.lifecycle_status <> 'archived'
        AND definitions.code IN (${SUPPORTED_DISCIPLINE_SQL_LIST})`, [workspaceId]);
  const byAthlete = new Map<string, PublicAthleteDisciplineStatistics[]>();
  for (const row of result.rows) {
    const disciplines = byAthlete.get(row.athlete_id) ?? [];
    disciplines.push({
      discipline: row.code, label: row.label, unit: row.unit, precision: Number(row.precision), direction: row.direction,
      pb: null, latestEffectiveResult: null, validResultCount: 0, average: null, consistency: null, improvement: null, progression: [],
    });
    byAthlete.set(row.athlete_id, disciplines);
  }
  return byAthlete;
}

async function getPublicAthleteStatistics(
  workspaceId: string,
  clubId: string,
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
  const publishedResults = await getPublicStatisticsReport({ season: season.selected === 'all' ? undefined : String(season.selected), club: clubId }, executor);
  const disciplines = disciplineStatistics(publishedResults);
  const preferences = await preferredDisciplinesByAthlete(workspaceId, executor);
  return result.rows.map((row) => {
    const published = disciplines.get(row.id) ?? [];
    const selected = preferences.get(row.id) ?? [];
    const allDisciplines = [...published, ...selected.filter((discipline) => !published.some((entry) => entry.discipline === discipline.discipline))]
      .sort((left, right) => left.label.localeCompare(right.label));
    return mapPublicAthleteStatistics(row, allDisciplines);
  });
}

export async function listPublicClubs(search: string | null): Promise<PublicClub[]> {
  const result = await getPool().query<PublicClubRow>(
    `SELECT id, workspace_id, name, description, primary_color, logo_key, cover_key
     FROM clubs
     WHERE public_results_enabled = true
       AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
     ORDER BY lower(name), id
     LIMIT 100`,
    [search],
  );
  return result.rows.map((row) => ({ id: row.id, name: row.name, branding: publicBrandSummary(row) }));
}

export async function getPublicClubStatistics(clubId: unknown, season: SeasonScope = parseSeasonYear(undefined)): Promise<PublicClubStatistics> {
  return withReadTransaction(async (client) => {
    const club = await findPublicClub(clubId, client);
    const statistics = await getClubStatistics(club.id, client, season);
    const athletes = await getPublicAthleteStatistics(club.workspace_id, club.id, client, season);
    const availableDisciplines = await listAvailableDisciplines(client);
    return {
      ...statistics,
      club: { id: club.id, name: club.name, branding: publicBrandSummary(club) },
      athletes,
      availableDisciplines,
    };
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
    `SELECT date, result FROM (
       SELECT e.date::text AS date, e.time::text AS event_time, e.created_at AS event_created_at, e.id AS event_id,
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
       UNION ALL
       SELECT e.date::text AS date, e.time::text AS event_time, e.created_at AS event_created_at, e.id AS event_id,
              CASE
                WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN r.manual_override
                ELSE r.final_result
              END AS result
       FROM session_results r
       JOIN discipline_sessions s ON s.id = r.session_id
       JOIN discipline_definitions d ON d.id = s.discipline_definition_id
       JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
       JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
       JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
       JOIN events e ON e.id = r.event_id
       WHERE en.athlete_id = $1
         AND d.code = $2
         AND r.workspace_id = $5
         AND r.outcome NOT IN ('dq', 'dnf', 'dns')
         AND (r.manual_override IS NOT NULL AND r.manual_override > 0 OR r.final_result IS NOT NULL)
         AND s.result_state = 'final' AND s.status = 'completed'
         AND e.status <> 'cancelled'
         AND e.date >= $3::date AND e.date < $4::date
         AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
         AND se.withdrawn_at IS NULL
         AND (e.workspace_id = r.workspace_id OR EXISTS (
           SELECT 1
           FROM event_fixture_workspaces fw
           WHERE fw.event_id = e.id
             AND fw.workspace_id = r.workspace_id
             AND fw.status = 'accepted'
             AND fw.accepted_revision = e.fixture_revision
         ))
     ) merged
     ORDER BY date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC`,
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
      const statistics = await getPublicAthleteStatistics(selectedAthlete.workspace_id, selectedAthlete.club_id, client, season);
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
