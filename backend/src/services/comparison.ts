import type { DbExecutor } from '../db/client.js';
import {
  mapProgressionEntryRow,
  type ProgressionEntryRow,
} from '../db/row-mappers.js';
import { withReadTransaction } from '../db/transaction.js';
import {
  DISCIPLINE_100M,
  type ComparisonDetail,
  type ComparisonAthleteAggregate,
  type MultiComparisonDetail,
} from '../types/domain.js';
import { ApiError } from '../middleware/errors.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { getAthlete } from './athletes.js';
import { parseSeasonYear, type SeasonScope } from './seasons.js';
import { listAvailableDisciplines } from './disciplineCatalog.js';
import type { PublicAthleteDisciplineStatistics } from '../types/domain.js';

type ReadTransactionRunner = <T>(
  operation: (client: DbExecutor) => Promise<T>,
) => Promise<T>;

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function validateAthleteIds(athleteIds: unknown): string[] {
  if (!Array.isArray(athleteIds)
    || athleteIds.length < 2
    || athleteIds.length > 5
    || !athleteIds.every(isCanonicalUuid)
    || new Set(athleteIds).size !== athleteIds.length) {
    throw new ApiError(422, 'ATHLETE_IDS_INVALID', 'Select two to five unique athlete IDs');
  }
  return athleteIds;
}

const PROGRESSION_SELECT = `
  WITH effective AS (
    SELECT r.event_id, r.athlete_id, r.discipline, r.final_result, r.unit, r.placing,
           r.is_pb, r.is_sb, r.manual_override, r.override_reason, r.overridden_by, r.updated_at,
           r.outcome, r.override_at,
            a.name AS athlete_name,
           a.archived_at AS athlete_archived_at,
           e.title AS event_title,
           e.type AS event_type,
           r.discipline AS event_discipline,
           e.date AS event_date,
           e.time AS event_time,
           e.location_name AS event_location_name,
           e.status AS event_status,
           e.created_at AS event_created_at,
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
    JOIN events e ON e.id = r.event_id
    JOIN athletes a ON a.id = r.athlete_id
     WHERE r.athlete_id = $1
       AND r.discipline = $3
       AND a.workspace_id = $2
       AND (e.workspace_id = $2 OR EXISTS (
         SELECT 1 FROM event_fixture_workspaces fw
         JOIN event_participants ep ON ep.event_id = fw.event_id
           AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
         WHERE fw.event_id = e.id AND fw.workspace_id = $2 AND fw.role = 'guest'
           AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
       ))
        AND e.status <> 'cancelled'
        AND e.date >= $4::date AND e.date < $5::date
    UNION ALL
    SELECT r.event_id, en.athlete_id, d.code, r.final_result,
           CASE WHEN r.final_result IS NULL THEN NULL ELSE r.unit END AS unit,
           NULL::int AS placing, false AS is_pb, false AS is_sb,
           r.manual_override, r.override_reason, r.overridden_by, r.updated_at,
           r.outcome, r.override_at,
            a.name AS athlete_name,
           a.archived_at AS athlete_archived_at,
           e.title AS event_title,
           e.type AS event_type,
           d.code AS event_discipline,
           e.date AS event_date,
           e.time AS event_time,
           e.location_name AS event_location_name,
           e.status AS event_status,
           e.created_at AS event_created_at,
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
    FROM session_results r
    JOIN discipline_sessions s ON s.id = r.session_id
    JOIN discipline_definitions d ON d.id = s.discipline_definition_id
    JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
    JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
    JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
    JOIN events e ON e.id = r.event_id
     WHERE en.athlete_id = $1
       AND d.code = $3
       AND r.workspace_id = $2
       AND s.result_state = 'final' AND s.status = 'completed'
       AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
       AND se.withdrawn_at IS NULL
       AND (e.workspace_id = r.workspace_id OR EXISTS (
         SELECT 1 FROM event_fixture_workspaces fw
         WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id
           AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
       ))
        AND e.status <> 'cancelled'
        AND e.date >= $4::date AND e.date < $5::date
  ), enriched AS (
    SELECT *,
           (event_status <> 'cancelled' AND effective_outcome = 'valid')
             AS counts_towards_statistics
    FROM effective
  ), ranked AS (
    SELECT *,
           CASE
             WHEN effective_outcome = 'valid' AND effective_result IS NOT NULL THEN
               MIN(effective_result) OVER (
                 ORDER BY event_date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
               )
             ELSE NULL
           END AS running_pb,
           ROW_NUMBER() OVER (
             ORDER BY event_date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC
           ) AS row_num
    FROM enriched
  ), summary AS (
    SELECT
      MIN(effective_result) FILTER (WHERE effective_outcome = 'valid') AS all_time_pb,
      COUNT(*) AS total_results,
      COUNT(*) FILTER (WHERE effective_outcome = 'valid') AS total_valid
    FROM enriched
  )
  SELECT ranked.*,
         (summary.all_time_pb) AS summary_pb,
         (summary.total_results) AS summary_total,
         (summary.total_valid) AS summary_valid,
         CASE
           WHEN ranked.effective_outcome = 'valid' AND ranked.effective_result IS NOT NULL
             AND ranked.running_pb IS NULL THEN true
           WHEN ranked.effective_outcome = 'valid' AND ranked.effective_result IS NOT NULL
             AND ranked.running_pb IS NOT NULL AND ranked.effective_result < ranked.running_pb THEN true
           ELSE false
         END AS is_new_pb
  FROM ranked
  CROSS JOIN summary
  ORDER BY event_date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC
`;

function computeAverage(validResults: number[]): number | null {
  if (validResults.length === 0) return null;
  const sum = validResults.reduce((a, b) => a + b, 0);
  return Math.round((sum / validResults.length) * 100) / 100;
}

function computeConsistency(validResults: number[]): number | null {
  if (validResults.length < 2) return null;
  const avg = validResults.reduce((a, b) => a + b, 0) / validResults.length;
  const squaredDiffs = validResults.map((r) => (r - avg) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / validResults.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

function computeImprovement(validResults: number[], pb: number | null): number | null {
  if (validResults.length < 2 || pb === null) return null;
  const earliest = validResults[0];
  return Math.round((earliest - pb) * 100) / 100;
}

async function fetchAthleteDisciplineStatistics(
  workspaceId: string,
  athleteId: string,
  client: DbExecutor,
  season: SeasonScope,
): Promise<PublicAthleteDisciplineStatistics[]> {
  const [results, preferences] = await Promise.all([
    client.query<{
      discipline: string; label: string; unit: PublicAthleteDisciplineStatistics['unit']; precision: number | string; direction: PublicAthleteDisciplineStatistics['direction'];
      event_date: string; event_time: string | null; event_created_at: string | Date; event_id: string; result: number | string;
    }>(`SELECT r.discipline, definitions.presentation->>'label' AS label, definitions.unit, definitions.precision, definitions.direction,
               e.date::text AS event_date, e.time::text AS event_time, e.created_at AS event_created_at, e.id AS event_id,
               CASE WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN r.manual_override ELSE r.final_result END AS result
        FROM results r
        JOIN events e ON e.id = r.event_id
        JOIN discipline_definitions definitions ON definitions.code = r.discipline
        WHERE r.athlete_id = $1 AND e.status <> 'cancelled'
          AND r.outcome NOT IN ('dq', 'dnf', 'dns')
          AND (r.manual_override IS NOT NULL AND r.manual_override > 0 OR r.final_result IS NOT NULL)
          AND e.date >= $2::date AND e.date < $3::date
          AND (e.workspace_id = $4 OR EXISTS (
            SELECT 1 FROM event_fixture_workspaces fw
            JOIN event_participants ep ON ep.event_id = fw.event_id
              AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
            WHERE fw.event_id = e.id AND fw.workspace_id = $4 AND fw.role = 'guest'
              AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
          ))
        UNION ALL
        SELECT d.code AS discipline, d.presentation->>'label' AS label, d.unit, d.precision, d.direction,
               e.date::text AS event_date, e.time::text AS event_time, e.created_at AS event_created_at, e.id AS event_id,
               CASE WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN r.manual_override ELSE r.final_result END AS result
        FROM session_results r
        JOIN discipline_sessions s ON s.id = r.session_id
        JOIN discipline_definitions d ON d.id = s.discipline_definition_id
        JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
        JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
        JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
        JOIN events e ON e.id = r.event_id
        WHERE en.athlete_id = $1
          AND r.workspace_id = $4
          AND s.result_state = 'final' AND s.status = 'completed' AND e.status <> 'cancelled'
          AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
          AND se.withdrawn_at IS NULL
          AND r.outcome NOT IN ('dq', 'dnf', 'dns')
          AND (r.manual_override IS NOT NULL AND r.manual_override > 0 OR r.final_result IS NOT NULL)
          AND e.date >= $2::date AND e.date < $3::date
          AND (e.workspace_id = r.workspace_id OR EXISTS (
            SELECT 1 FROM event_fixture_workspaces fw
            WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id
              AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
          ))
        ORDER BY discipline, event_date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC`, [
      athleteId,
      season.selected === 'all' ? '0001-01-01' : season.startDate!,
      season.selected === 'all' ? '9999-12-31' : season.endDate!,
      workspaceId,
    ]),
    client.query<{
      code: string; label: string; unit: PublicAthleteDisciplineStatistics['unit']; precision: number | string; direction: PublicAthleteDisciplineStatistics['direction'];
    }>(`SELECT definitions.code, definitions.presentation->>'label' AS label, definitions.unit, definitions.precision, definitions.direction
        FROM athlete_preferred_disciplines preferences
        JOIN discipline_definitions definitions ON definitions.id = preferences.discipline_definition_id
        WHERE preferences.athlete_id = $1`, [athleteId]),
  ]);

  const byDiscipline = new Map<string, PublicAthleteDisciplineStatistics>();
  for (const row of results?.rows ?? []) {
    const existing = byDiscipline.get(row.discipline);
    const value = Number(row.result);
    if (!existing) {
      byDiscipline.set(row.discipline, {
        discipline: row.discipline, label: row.label, unit: row.unit, precision: Number(row.precision), direction: row.direction,
        pb: value, latestEffectiveResult: value, validResultCount: 1, average: value, consistency: null, improvement: null,
        progression: [{ date: row.event_date, result: value }],
      });
      continue;
    }
    const values = [...existing.progression.map(({ result }) => result), value];
    const pb = existing.direction === 'lower' ? Math.min(...values) : Math.max(...values);
    const average = values.reduce((total, result) => total + result, 0) / values.length;
    const variance = values.reduce((total, result) => total + (result - average) ** 2, 0) / values.length;
    existing.pb = pb;
    existing.latestEffectiveResult = value;
    existing.validResultCount = values.length;
    existing.average = Math.round(average * 100) / 100;
    existing.consistency = Math.round(Math.sqrt(variance) * 100) / 100;
    existing.improvement = existing.direction === 'lower'
      ? Math.round((existing.progression[0]!.result - pb) * 100) / 100
      : Math.round((pb - existing.progression[0]!.result) * 100) / 100;
    existing.progression.push({ date: row.event_date, result: value });
  }
  for (const preference of preferences?.rows ?? []) {
    if (!byDiscipline.has(preference.code)) {
      byDiscipline.set(preference.code, {
        discipline: preference.code, label: preference.label, unit: preference.unit, precision: Number(preference.precision), direction: preference.direction,
        pb: null, latestEffectiveResult: null, validResultCount: 0, average: null, consistency: null, improvement: null, progression: [],
      });
    }
  }
  return [...byDiscipline.values()].sort((left, right) => left.label.localeCompare(right.label));
}

async function fetchAthleteAggregate(
  workspaceId: string,
  athleteId: unknown,
  client: DbExecutor,
  season: SeasonScope,
): Promise<ComparisonAthleteAggregate> {
  const athlete = await getAthlete(workspaceId, athleteId, client);

  const result = await client.query<ProgressionEntryRow & {
    summary_pb: number | string | null;
    summary_total: number;
    summary_valid: number;
  }>(PROGRESSION_SELECT, [
    athlete.id,
    workspaceId,
    DISCIPLINE_100M,
    season.selected === 'all' ? '0001-01-01' : season.startDate!,
    season.selected === 'all' ? '9999-12-31' : season.endDate!,
  ]);

  const entries = result.rows.map(mapProgressionEntryRow);
  const firstRow = result.rows[0];
  // PostgreSQL NUMERIC aggregates are returned as strings by pg.
  const pb = firstRow?.summary_pb === null || firstRow === undefined
    ? null
    : Number(firstRow.summary_pb);
  const totalResults = firstRow ? Number(firstRow.summary_total) : 0;
  const totalValid = firstRow ? Number(firstRow.summary_valid) : 0;

  const validEntries = entries.filter(
    (e) => e.effectiveOutcome === 'valid' && e.effectiveResult !== null,
  );
  const validResults = validEntries.map((e) => e.effectiveResult!);

  const lastValidEntry = [...entries].reverse().find(
    (e) => e.effectiveOutcome === 'valid' && e.effectiveResult !== null,
  );

  const average = computeAverage(validResults);
  const consistency = computeConsistency(validResults);
  const improvement = computeImprovement(validResults, pb);

  return {
    athlete: {
      id: athlete.id,
      name: athlete.name,
      archivedAt: athlete.archivedAt,
      status: athlete.status,
    },
    pb,
    latestEffectiveResult: lastValidEntry ? lastValidEntry.effectiveResult : null,
    latestEffectiveOutcome: lastValidEntry ? lastValidEntry.effectiveOutcome : 'no_result',
    validResultCount: totalValid,
    totalResultCount: totalResults,
    average,
    consistency,
    improvement,
    progression: entries,
    disciplines: [],
  };
}

async function hydrateDisciplineStatistics(
  athletes: ComparisonAthleteAggregate[],
  workspaceIds: string[],
  client: DbExecutor,
  season: SeasonScope,
): Promise<ComparisonAthleteAggregate[]> {
  return Promise.all(athletes.map(async (athlete, index) => ({
    ...athlete,
    disciplines: await fetchAthleteDisciplineStatistics(workspaceIds[index]!, athlete.athlete.id, client, season),
  })));
}

export async function getTwoAthleteComparison(
  workspaceId: string,
  athlete1Id: unknown,
  athlete2Id: unknown,
  runTransaction: ReadTransactionRunner = withReadTransaction,
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<ComparisonDetail> {
  if (!athlete1Id || !athlete2Id) throw notFound();
  if (String(athlete1Id) === String(athlete2Id)) {
    throw new ApiError(400, 'DUPLICATE_ATHLETE_ID', 'Exactly two distinct athlete IDs are required');
  }

  return runTransaction(async (client) => {
    const athlete1 = await fetchAthleteAggregate(workspaceId, athlete1Id, client, season);
    const athlete2 = await fetchAthleteAggregate(workspaceId, athlete2Id, client, season);

    return {
      athletes: await hydrateDisciplineStatistics([athlete1, athlete2], [workspaceId, workspaceId], client, season) as ComparisonDetail['athletes'],
      availableDisciplines: await listAvailableDisciplines(client),
    };
  });
}

export async function getCrossClubAthleteComparison(
  athlete1Id: unknown,
  athlete2Id: unknown,
  runTransaction: ReadTransactionRunner = withReadTransaction,
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<ComparisonDetail> {
  if (!isCanonicalUuid(athlete1Id) || !isCanonicalUuid(athlete2Id)) throw notFound();
  if (athlete1Id === athlete2Id) {
    throw new ApiError(400, 'DUPLICATE_ATHLETE_ID', 'Exactly two distinct athlete IDs are required');
  }

  return runTransaction(async (client) => {
    const athletes = await client.query<{ id: string; workspace_id: string }>(
      `SELECT a.id, a.workspace_id
       FROM athletes a
       JOIN clubs c ON c.workspace_id = a.workspace_id
       WHERE a.id = ANY($1::uuid[])`,
      [[athlete1Id, athlete2Id]],
    );
    if (athletes.rows.length !== 2) throw notFound();

    const workspacesByAthleteId = new Map(
      athletes.rows.map((athlete) => [athlete.id, athlete.workspace_id]),
    );
    const athlete1WorkspaceId = workspacesByAthleteId.get(athlete1Id);
    const athlete2WorkspaceId = workspacesByAthleteId.get(athlete2Id);
    if (!athlete1WorkspaceId || !athlete2WorkspaceId) throw notFound();
    if (athlete1WorkspaceId === athlete2WorkspaceId) {
      throw new ApiError(
        422,
        'CROSS_CLUB_COMPARISON_REQUIRES_DISTINCT_CLUBS',
        'Cross-club comparison requires athletes from distinct club workspaces',
      );
    }

    const athlete1 = await fetchAthleteAggregate(athlete1WorkspaceId, athlete1Id, client, season);
    const athlete2 = await fetchAthleteAggregate(athlete2WorkspaceId, athlete2Id, client, season);
    return {
      athletes: await hydrateDisciplineStatistics([athlete1, athlete2], [athlete1WorkspaceId, athlete2WorkspaceId], client, season) as ComparisonDetail['athletes'],
      availableDisciplines: await listAvailableDisciplines(client),
    };
  });
}

export async function getMultiAthleteComparison(
  workspaceId: string,
  athleteIds: unknown,
  runTransaction: ReadTransactionRunner = withReadTransaction,
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<MultiComparisonDetail> {
  const ids = validateAthleteIds(athleteIds);
  return runTransaction(async (client) => {
    const athletes = await Promise.all(ids.map((athleteId) => fetchAthleteAggregate(workspaceId, athleteId, client, season)));
    return {
      athletes: await hydrateDisciplineStatistics(athletes, ids.map(() => workspaceId), client, season),
      availableDisciplines: await listAvailableDisciplines(client),
    };
  });
}

export async function getCrossClubMultiAthleteComparison(
  athleteIds: unknown,
  runTransaction: ReadTransactionRunner = withReadTransaction,
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<MultiComparisonDetail> {
  const ids = validateAthleteIds(athleteIds);
  return runTransaction(async (client) => {
    const athletes = await client.query<{ id: string; workspace_id: string }>(
      `SELECT a.id, a.workspace_id
       FROM athletes a
       JOIN clubs c ON c.workspace_id = a.workspace_id
       WHERE a.id = ANY($1::uuid[])`,
      [ids],
    );
    if (athletes.rows.length !== ids.length) throw notFound();

    const workspacesByAthleteId = new Map(
      athletes.rows.map((athlete) => [athlete.id, athlete.workspace_id]),
    );
    const workspaceIds = ids.map((id) => workspacesByAthleteId.get(id));
    if (workspaceIds.some((workspaceId) => !workspaceId)) throw notFound();
    if (new Set(workspaceIds).size < 2) {
      throw new ApiError(
        422,
        'CROSS_CLUB_COMPARISON_REQUIRES_DISTINCT_CLUBS',
        'Cross-club comparison requires athletes from at least two club workspaces',
      );
    }

    const aggregates = await Promise.all(ids.map((athleteId, index) =>
      fetchAthleteAggregate(workspaceIds[index]!, athleteId, client, season)));
    return {
      athletes: await hydrateDisciplineStatistics(aggregates, workspaceIds as string[], client, season),
      availableDisciplines: await listAvailableDisciplines(client),
    };
  });
}
