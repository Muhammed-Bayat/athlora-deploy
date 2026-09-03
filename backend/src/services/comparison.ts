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
} from '../types/domain.js';
import { ApiError } from '../middleware/errors.js';
import { getAthlete } from './athletes.js';

type ReadTransactionRunner = <T>(
  operation: (client: DbExecutor) => Promise<T>,
) => Promise<T>;

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

const PROGRESSION_SELECT = `
  WITH effective AS (
    SELECT r.*,
           a.name AS athlete_name,
           COALESCE((SELECT array_agg(s.name ORDER BY lower(s.name), s.id) FROM athlete_squads axs JOIN squads s ON s.id = axs.squad_id WHERE axs.athlete_id = a.id), ARRAY[]::text[]) AS athlete_squad_names,
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
      AND e.workspace_id = $2
      AND e.status <> 'cancelled'
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

async function fetchAthleteAggregate(
  workspaceId: string,
  athleteId: unknown,
  client: DbExecutor,
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
      squadNames: athlete.squads?.map((squad) => squad.name) ?? [],
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
  };
}

export async function getTwoAthleteComparison(
  workspaceId: string,
  athlete1Id: unknown,
  athlete2Id: unknown,
  runTransaction: ReadTransactionRunner = withReadTransaction,
): Promise<ComparisonDetail> {
  if (!athlete1Id || !athlete2Id) throw notFound();
  if (String(athlete1Id) === String(athlete2Id)) {
    throw new ApiError(400, 'DUPLICATE_ATHLETE_ID', 'Exactly two distinct athlete IDs are required');
  }

  return runTransaction(async (client) => {
    const athlete1 = await fetchAthleteAggregate(workspaceId, athlete1Id, client);
    const athlete2 = await fetchAthleteAggregate(workspaceId, athlete2Id, client);

    return {
      athletes: [athlete1, athlete2],
    };
  });
}
