import type { DbExecutor } from '../db/client.js';
import {
  mapAthleteResultCounts,
  mapAthleteResultHistoryRow,
  mapAthleteStatisticsRow,
  type AthleteResultHistoryRow,
  type AthleteStatisticsAggregateRow,
} from '../db/row-mappers.js';
import { withReadTransaction } from '../db/transaction.js';
import {
  DISCIPLINE_100M,
  RESULT_UNIT_SECONDS,
  type AthleteStatisticsDetail,
} from '../types/domain.js';
import { isGregorianDate } from '../validation/primitives.js';
import { getAthlete } from './athletes.js';

const RECENT_RESULTS_PER_TYPE = 10;

type ReadTransactionRunner = <T>(
  operation: (client: DbExecutor) => Promise<T>,
) => Promise<T>;

function utcDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function calendarYearBounds(asOfDate: string): [string, string] {
  if (!isGregorianDate(asOfDate)) throw new Error('Invalid aggregate as-of date');
  const year = Number(asOfDate.slice(0, 4));
  return [`${year}-01-01`, `${year + 1}-01-01`];
}

export async function getAthleteStatisticsDetail(
  userId: string,
  athleteId: unknown,
  asOfDate = utcDateToday(),
  runTransaction: ReadTransactionRunner = withReadTransaction,
): Promise<AthleteStatisticsDetail> {
  const [yearStart, nextYearStart] = calendarYearBounds(asOfDate);

  return runTransaction(async (client) => {
    const athlete = await getAthlete(userId, athleteId, client);
    const statisticsResult = await client.query<AthleteStatisticsAggregateRow>(
      `WITH effective AS (
         SELECT r.outcome,
                r.final_result,
                r.manual_override,
                r.updated_at,
                e.type AS event_type,
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
         JOIN events e ON e.id = r.event_id
         JOIN athletes a ON a.id = r.athlete_id
         WHERE r.athlete_id = $1
           AND r.discipline = $3
           AND a.coach_id = $2
           AND e.created_by = $2
           AND e.status <> 'cancelled'
       ), latest AS (
         SELECT effective_result, effective_outcome
         FROM effective
         ORDER BY event_date DESC,
                  event_time DESC NULLS LAST,
                  event_created_at DESC,
                  event_id DESC
         LIMIT 1
       )
       SELECT a.id AS athlete_id,
              $3::text AS discipline,
              $4::text AS unit,
              MIN(e.effective_result) FILTER (
                WHERE e.effective_outcome = 'valid'
              ) AS pb,
              MIN(e.effective_result) FILTER (
                WHERE e.effective_outcome = 'valid'
                  AND e.event_date >= $5::date
                  AND e.event_date < $6::date
              ) AS sb,
              COUNT(*) FILTER (
                WHERE e.effective_outcome = 'valid'
                  AND e.event_date >= $5::date
                  AND e.event_date < $6::date
              ) AS results_count,
              (SELECT effective_result FROM latest) AS latest_result,
              COALESCE((SELECT effective_outcome FROM latest), 'no_result') AS latest_outcome,
              COALESCE(MAX(e.updated_at), a.updated_at) AS updated_at,
              COUNT(*) FILTER (WHERE e.effective_outcome = 'valid') AS all_time_count,
              COUNT(*) FILTER (
                WHERE e.effective_outcome = 'valid'
                  AND e.event_date >= $5::date
                  AND e.event_date < $6::date
              ) AS current_year_count,
              COUNT(*) FILTER (
                WHERE e.effective_outcome = 'valid' AND e.event_type = 'competition'
              ) AS competition_all_time_count,
              COUNT(*) FILTER (
                WHERE e.effective_outcome = 'valid' AND e.event_type = 'training'
              ) AS training_all_time_count
       FROM athletes a
       LEFT JOIN effective e ON true
       WHERE a.id = $1 AND a.coach_id = $2
       GROUP BY a.id, a.updated_at`,
      [
        athlete.id,
        userId,
        DISCIPLINE_100M,
        RESULT_UNIT_SECONDS,
        yearStart,
        nextYearStart,
      ],
    );
    const statisticsRow = statisticsResult.rows[0];
    if (!statisticsRow) throw new Error('Owned athlete aggregate query returned no row');

    const historyResult = await client.query<AthleteResultHistoryRow>(
      `WITH history AS (
         SELECT r.*,
                a.name AS athlete_name,
                a.squad AS athlete_squad,
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
           AND a.coach_id = $2
           AND e.created_by = $2
       ), selected AS (
         (SELECT * FROM history
          WHERE event_type = 'competition'
          ORDER BY event_date DESC, event_time DESC NULLS LAST, event_created_at DESC, event_id DESC
          LIMIT $4)
         UNION
         (SELECT * FROM history
          WHERE event_type = 'training'
          ORDER BY event_date DESC, event_time DESC NULLS LAST, event_created_at DESC, event_id DESC
          LIMIT $4)
         UNION
         (SELECT * FROM history
          WHERE event_status <> 'cancelled'
          ORDER BY event_date DESC, event_time DESC NULLS LAST, event_created_at DESC, event_id DESC
          LIMIT 1)
       )
       SELECT selected.*,
              (event_status <> 'cancelled' AND effective_outcome = 'valid')
                AS counts_towards_statistics
       FROM selected
       ORDER BY event_date DESC,
                event_time DESC NULLS LAST,
                event_created_at DESC,
                event_id DESC`,
      [athlete.id, userId, DISCIPLINE_100M, RECENT_RESULTS_PER_TYPE],
    );
    const history = historyResult.rows.map(mapAthleteResultHistoryRow);
    const statistics = mapAthleteStatisticsRow(statisticsRow);

    return {
      ...statistics,
      athlete: {
        id: athlete.id,
        name: athlete.name,
        squad: athlete.squad,
        archivedAt: athlete.archivedAt,
      },
      resultCounts: mapAthleteResultCounts(statisticsRow),
      latest: history.find((entry) => entry.event.status !== 'cancelled') ?? null,
      recentResults: {
        competitions: history
          .filter((entry) => entry.event.type === 'competition')
          .slice(0, RECENT_RESULTS_PER_TYPE),
        training: history
          .filter((entry) => entry.event.type === 'training')
          .slice(0, RECENT_RESULTS_PER_TYPE),
      },
    };
  });
}
