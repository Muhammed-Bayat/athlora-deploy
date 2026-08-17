import type { DbExecutor } from '../db/client.js';
import {
  mapAthleteResultHistoryRow,
  mapDashboardActiveEventRow,
  mapDashboardMetricsRow,
  mapDashboardTimelineEntryRow,
  mapDashboardUpcomingEventRow,
  mapRosterSnapshotRow,
  type AthleteResultHistoryRow,
  type DashboardActiveEventRow,
  type DashboardMetricsRow,
  type DashboardTimelineEntryRow,
  type DashboardUpcomingEventRow,
  type RosterSnapshotRow,
} from '../db/row-mappers.js';
import { withReadTransaction } from '../db/transaction.js';
import {
  DISCIPLINE_100M,
  type AthleteResultHistoryEntry,
  type DashboardSummary,
} from '../types/domain.js';
import { isCanonicalUuid, isGregorianDate } from '../validation/primitives.js';
import { ApiError } from '../middleware/errors.js';

const LATEST_ENTRIES_LIMIT = 10;
const RECENT_RESULTS_LIMIT = 10;
const RECENT_PBS_LIMIT = 5;

type ReadTransactionRunner = <T>(
  operation: (client: DbExecutor) => Promise<T>,
) => Promise<T>;

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function utcDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function calendarYearBounds(asOfDate: string): [string, string] {
  if (!isGregorianDate(asOfDate)) throw new Error('Invalid aggregate as-of date');
  const year = Number(asOfDate.slice(0, 4));
  return [`${year}-01-01`, `${year + 1}-01-01`];
}

async function listRecentResults(
  client: DbExecutor,
  userId: string,
  onlyPbs: boolean,
  limit: number,
): Promise<AthleteResultHistoryEntry[]> {
  const result = await client.query<AthleteResultHistoryRow>(
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
       WHERE e.created_by = $1
         AND a.coach_id = $1
         AND r.discipline = $2
         AND e.status <> 'cancelled'
         ${onlyPbs ? 'AND r.is_pb = true' : ''}
     )
     SELECT history.*,
            (effective_outcome = 'valid') AS counts_towards_statistics
     FROM history
     ORDER BY event_date DESC,
              event_time DESC NULLS LAST,
              event_created_at DESC,
              event_id DESC,
              athlete_id ASC
     LIMIT $3`,
    [userId, DISCIPLINE_100M, limit],
  );
  return result.rows.map(mapAthleteResultHistoryRow);
}

export async function getDashboardSummary(
  userId: string,
  asOfDate = utcDateToday(),
  runTransaction: ReadTransactionRunner = withReadTransaction,
): Promise<DashboardSummary> {
  if (!isCanonicalUuid(userId)) throw notFound();
  const [yearStart, nextYearStart] = calendarYearBounds(asOfDate);

  return runTransaction(async (client) => {
    const metricsResult = await client.query<DashboardMetricsRow>(
      `SELECT
         (SELECT COUNT(*) FROM athletes WHERE coach_id = $1) AS athletes_count,
         (SELECT COUNT(*) FROM athletes
          WHERE coach_id = $1 AND archived_at IS NULL) AS active_athletes_count,
         (SELECT COUNT(*) FROM athletes
          WHERE coach_id = $1 AND archived_at IS NOT NULL) AS archived_athletes_count,
         (SELECT COUNT(*) FROM events
          WHERE created_by = $1
            AND status = 'scheduled'
            AND discipline = $5
            AND date >= $2::date)
           AS upcoming_event_count,
         (SELECT COUNT(*)
          FROM results r
          JOIN events e ON e.id = r.event_id
          JOIN athletes a ON a.id = r.athlete_id
          WHERE e.created_by = $1
            AND a.coach_id = $1
            AND e.status <> 'cancelled'
            AND r.discipline = $5
            AND r.is_pb = true
            AND e.date >= $3::date
            AND e.date < $4::date) AS season_pbs`,
      [userId, asOfDate, yearStart, nextYearStart, DISCIPLINE_100M],
    );
    const metricsRow = metricsResult.rows[0];
    if (!metricsRow) throw new Error('Dashboard metrics query returned no row');
    const metrics = mapDashboardMetricsRow(metricsRow);

    const activeResult = await client.query<DashboardActiveEventRow>(
      `SELECT e.id AS event_id,
              e.title AS event_title,
              e.type AS event_type,
              e.discipline AS event_discipline,
              e.date AS event_date,
              e.time AS event_time,
              e.location_name AS event_location_name,
              e.status AS event_status,
              (SELECT COUNT(*)
               FROM event_participants ep
               JOIN athletes a ON a.id = ep.athlete_id
               WHERE ep.event_id = e.id AND a.coach_id = $1) AS participant_count,
              (SELECT COUNT(DISTINCT te.athlete_id)
               FROM event_participants ep
               JOIN athletes a ON a.id = ep.athlete_id
               JOIN timeline_entries te
                 ON te.event_id = ep.event_id AND te.athlete_id = ep.athlete_id
               WHERE ep.event_id = e.id
                 AND te.deleted_at IS NULL
                 AND te.discipline = $2
                 AND a.coach_id = $1) AS athletes_with_entries_count,
              (SELECT COUNT(*)
               FROM event_participants ep
               JOIN athletes a ON a.id = ep.athlete_id
               JOIN results r
                 ON r.event_id = ep.event_id AND r.athlete_id = ep.athlete_id
               WHERE ep.event_id = e.id
                 AND r.discipline = $2
                 AND a.coach_id = $1
                 AND CASE
                       WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN r.outcome
                       WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN 'valid'
                       ELSE r.outcome
                     END <> 'no_result') AS resolved_results_count,
              (SELECT COUNT(*)
               FROM event_participants ep
               JOIN athletes a ON a.id = ep.athlete_id
               JOIN timeline_entries te
                 ON te.event_id = ep.event_id AND te.athlete_id = ep.athlete_id
               WHERE ep.event_id = e.id
                 AND te.deleted_at IS NULL
                 AND te.discipline = $2
                 AND a.coach_id = $1) AS entry_count
       FROM events e
       WHERE e.created_by = $1
         AND e.status = 'in_progress'
         AND e.discipline = $2
       ORDER BY e.date ASC,
                e.time ASC NULLS LAST,
                e.created_at ASC,
                e.id ASC
       LIMIT 1`,
      [userId, DISCIPLINE_100M],
    );
    const activeRow = activeResult.rows[0];
    const activeBase = activeRow ? mapDashboardActiveEventRow(activeRow) : null;
    const latestEntries = activeBase
      ? await client.query<DashboardTimelineEntryRow>(
        `SELECT te.*,
                a.name AS athlete_name,
                a.squad AS athlete_squad,
                a.archived_at AS athlete_archived_at
         FROM timeline_entries te
         JOIN events e ON e.id = te.event_id
         JOIN athletes a ON a.id = te.athlete_id
         WHERE te.event_id = $1
           AND e.created_by = $2
           AND a.coach_id = $2
           AND te.deleted_at IS NULL
           AND te.discipline = $3
         ORDER BY te.created_at DESC, te.id DESC
         LIMIT $4`,
        [activeBase.event.id, userId, DISCIPLINE_100M, LATEST_ENTRIES_LIMIT],
      )
      : { rows: [] as DashboardTimelineEntryRow[] };

    const rosterResult = await client.query<RosterSnapshotRow>(
      `SELECT a.id AS athlete_id,
              a.name,
              a.squad,
              $2::text AS discipline,
              best.pb
       FROM athletes a
       LEFT JOIN LATERAL (
         SELECT MIN(
           CASE
             WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN NULL
             WHEN r.manual_override IS NOT NULL AND r.manual_override > 0
               THEN r.manual_override
             ELSE r.final_result
           END
         ) FILTER (
           WHERE CASE
                   WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN r.outcome
                   WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN 'valid'
                   ELSE r.outcome
                 END = 'valid'
         ) AS pb
         FROM results r
         JOIN events e ON e.id = r.event_id
         WHERE r.athlete_id = a.id
           AND r.discipline = $2
           AND e.created_by = $1
           AND e.status <> 'cancelled'
       ) best ON true
       WHERE a.coach_id = $1 AND a.archived_at IS NULL
       ORDER BY LOWER(a.name) ASC, a.created_at ASC, a.id ASC`,
      [userId, DISCIPLINE_100M],
    );

    const upcomingResult = await client.query<DashboardUpcomingEventRow>(
      `SELECT e.id AS event_id,
              e.title,
              e.type,
              e.discipline,
              e.date,
              e.time,
              e.location_name,
              e.status,
              COUNT(a.id) AS athlete_count
       FROM events e
       LEFT JOIN event_participants ep ON ep.event_id = e.id
       LEFT JOIN athletes a ON a.id = ep.athlete_id AND a.coach_id = $1
       WHERE e.created_by = $1
         AND e.status = 'scheduled'
         AND e.discipline = $3
         AND e.date >= $2::date
       GROUP BY e.id
       ORDER BY e.date ASC,
                e.time ASC NULLS LAST,
                e.created_at ASC,
                e.id ASC`,
      [userId, asOfDate, DISCIPLINE_100M],
    );

    const recentResults = await listRecentResults(
      client,
      userId,
      false,
      RECENT_RESULTS_LIMIT,
    );
    const recentPbs = await listRecentResults(client, userId, true, RECENT_PBS_LIMIT);

    return {
      state: activeBase ? 'live' : 'summary',
      asOfDate,
      ...metrics,
      activeEvent: activeBase
        ? {
          ...activeBase,
          latestEntries: latestEntries.rows.map(mapDashboardTimelineEntryRow),
        }
        : null,
      rosterSnapshot: rosterResult.rows.map(mapRosterSnapshotRow),
      upcomingEvents: upcomingResult.rows.map(mapDashboardUpcomingEventRow),
      recentResults,
      recentPbs,
    };
  });
}
