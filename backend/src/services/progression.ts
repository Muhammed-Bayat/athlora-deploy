import type { DbExecutor } from '../db/client.js';
import {
  mapProgressionEntryRow,
  type ProgressionEntryRow,
} from '../db/row-mappers.js';
import { withReadTransaction } from '../db/transaction.js';
import {
  DISCIPLINE_100M,
  RESULT_UNIT_SECONDS,
  type ProgressionDetail,
} from '../types/domain.js';
import { getAthlete } from './athletes.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

type ReadTransactionRunner = <T>(
  operation: (client: DbExecutor) => Promise<T>,
) => Promise<T>;

interface ProgressionQueryOptions {
  cursor?: string;
  limit?: number;
  type?: string;
}

function parseCursor(cursor: string | undefined): { date: string; time: string; eventId: string } | null {
  if (!cursor) return null;
  const parts = cursor.split('|');
  if (parts.length !== 3) return null;
  return { date: parts[0], time: parts[1], eventId: parts[2] };
}

function encodeCursor(date: string, time: string, eventId: string): string {
  return `${date}|${time}|${eventId}`;
}

export async function getAthleteProgressionDetail(
  workspaceId: string,
  athleteId: unknown,
  options: ProgressionQueryOptions = {},
  runTransaction: ReadTransactionRunner = withReadTransaction,
): Promise<ProgressionDetail> {
  const pageSize = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const cursor = parseCursor(options.cursor);
  const typeFilter = options.type === 'competition' || options.type === 'training' ? options.type : null;

  return runTransaction(async (client) => {
    const athlete = await getAthlete(workspaceId, athleteId, client);

    const cursorCondition = cursor
      ? `AND (e.date, COALESCE(e.time, '99:99'), r.event_id) > ($5::date, $6::text, $7::uuid)`
      : '';

    const typeCondition = typeFilter
      ? `AND e.type = $8`
      : '';

    const params: unknown[] = [
      athlete.id,
      workspaceId,
      DISCIPLINE_100M,
      RESULT_UNIT_SECONDS,
      ...(cursor ? [cursor.date, cursor.time, cursor.eventId] : []),
      ...(typeFilter ? [typeFilter] : []),
    ];

    const progressionQuery = `
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
          ${cursorCondition}
          ${typeCondition}
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
        FROM effective
      ), summary AS (
        SELECT
          MIN(effective_result) FILTER (WHERE effective_outcome = 'valid') AS all_time_pb,
          COUNT(*) AS total_results,
          COUNT(*) FILTER (WHERE effective_outcome = 'valid') AS total_valid
        FROM effective
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
      LIMIT $4
    `;

    const result = await client.query<ProgressionEntryRow & {
      summary_pb: number | null;
      summary_total: number;
      summary_valid: number;
    }>(progressionQuery, params);

    const entries = result.rows.map(mapProgressionEntryRow);

    const firstRow = result.rows[0];
    const summary = {
      allTimePb: firstRow ? (firstRow.summary_pb as number | null) : null,
      totalResults: firstRow ? Number(firstRow.summary_total) : 0,
      totalValid: firstRow ? Number(firstRow.summary_valid) : 0,
    };

    let nextCursor: string | null = null;
    if (entries.length === pageSize) {
      const lastRow = result.rows[result.rows.length - 1];
      const lastTime = lastRow.event_time ?? '';
      nextCursor = encodeCursor(
        String(lastRow.event_date),
        lastTime,
        String(lastRow.event_id),
      );
    }

    return {
      athlete: {
        id: athlete.id,
        name: athlete.name,
        squadNames: athlete.squads?.map((squad) => squad.name) ?? [],
        archivedAt: athlete.archivedAt,
      },
      entries,
      pagination: {
        nextCursor,
        count: entries.length,
        total: summary.totalResults,
      },
      summary,
    };
  });
}
