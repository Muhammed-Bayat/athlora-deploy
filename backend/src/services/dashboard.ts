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
import { isCanonicalUuid } from '../validation/primitives.js';
import { ApiError } from '../middleware/errors.js';
import { parseSeasonYear, type SeasonScope } from './seasons.js';

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

async function listRecentResults(
  client: DbExecutor,
   workspaceId: string,
  onlyPbs: boolean,
  limit: number,
  season: SeasonScope,
): Promise<AthleteResultHistoryEntry[]> {
  const result = await client.query<AthleteResultHistoryRow>(
    `WITH history AS (
       SELECT r.event_id, r.athlete_id, r.discipline, r.final_result, r.unit, r.placing,
              r.is_pb AS stored_is_pb, r.is_sb, r.manual_override, r.override_reason, r.overridden_by, r.updated_at,
              r.outcome, r.override_at, 'legacy' AS result_source,
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
         WHERE (e.workspace_id = $1 OR EXISTS (
             SELECT 1 FROM event_fixture_workspaces fw
             JOIN event_participants ep ON ep.event_id = fw.event_id
               AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
             WHERE fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
               AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
           ))
           AND a.workspace_id = $1
         AND r.discipline = $2
          AND e.status <> 'cancelled'
          AND e.date >= $4::date AND e.date < $5::date
       UNION ALL
       SELECT r.event_id, en.athlete_id, d.code, r.final_result,
              CASE WHEN r.final_result IS NULL THEN NULL ELSE r.unit END AS unit,
              NULL::int, false, false,
              r.manual_override, r.override_reason, r.overridden_by, r.updated_at,
              r.outcome, r.override_at, 'session' AS result_source,
              a.name AS athlete_name,
               COALESCE((SELECT array_agg(s.name ORDER BY lower(s.name), s.id) FROM athlete_squads axs JOIN squads s ON s.id = axs.squad_id WHERE axs.athlete_id = a.id), ARRAY[]::text[]) AS athlete_squad_names,
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
         WHERE r.workspace_id = $1
           AND d.code = $2
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
     ), windowed AS (
       SELECT history.*,
              MIN(effective_result) FILTER (WHERE effective_outcome = 'valid')
                OVER (PARTITION BY athlete_id
                      ORDER BY event_date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC
                      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS running_pb
       FROM history
     )
     SELECT windowed.*,
            CASE WHEN result_source = 'legacy' THEN stored_is_pb
                 ELSE effective_outcome = 'valid' AND (running_pb IS NULL OR effective_result < running_pb)
            END AS is_pb,
            (effective_outcome = 'valid') AS counts_towards_statistics
     FROM windowed
     ${onlyPbs ? `WHERE (result_source = 'legacy' AND stored_is_pb)
                OR (result_source = 'session' AND effective_outcome = 'valid'
                    AND (running_pb IS NULL OR effective_result < running_pb))` : ''}
     ORDER BY event_date DESC,
              event_time DESC NULLS LAST,
              event_created_at DESC,
              event_id DESC,
              athlete_id ASC
      LIMIT $3`,
    [workspaceId, DISCIPLINE_100M, limit, season.selected === 'all' ? '0001-01-01' : season.startDate!, season.selected === 'all' ? '9999-12-31' : season.endDate!],
  );
  return result.rows.map(mapAthleteResultHistoryRow);
}

export async function getDashboardSummary(
  workspaceId: string,
  asOfDate = utcDateToday(),
  runTransaction: ReadTransactionRunner = withReadTransaction,
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<DashboardSummary> {
  if (!isCanonicalUuid(workspaceId)) throw notFound();
  const [yearStart, nextYearStart] = season.selected === 'all'
    ? ['0001-01-01', '9999-12-31']
    : [season.startDate!, season.endDate!];

  return runTransaction(async (client) => {
    const metricsResult = await client.query<DashboardMetricsRow>(
      `SELECT
          (SELECT COUNT(*) FROM athletes WHERE workspace_id = $1) AS athletes_count,
          (SELECT COUNT(*) FROM athletes
            WHERE workspace_id = $1 AND lifecycle_status = 'active') AS active_athletes_count,
          (SELECT COUNT(*) FROM athletes
            WHERE workspace_id = $1 AND lifecycle_status = 'inactive') AS inactive_athletes_count,
          (SELECT COUNT(*) FROM athletes
            WHERE workspace_id = $1 AND lifecycle_status = 'archived') AS archived_athletes_count,
          (SELECT COUNT(*)
           FROM event_participant_status_reviews epsr
           JOIN events e ON e.id = epsr.event_id
           WHERE e.workspace_id = $1 AND epsr.acknowledged_at IS NULL) AS status_review_count,
         (SELECT COUNT(*) FROM events
           WHERE workspace_id = $1
            AND status = 'scheduled'
             AND date >= $2::date
             AND date <= ($2::date + INTERVAL '7 days'))
           AS upcoming_event_count,
         (SELECT COUNT(*) FROM (
           WITH history AS (
             SELECT r.athlete_id, r.is_pb AS stored_is_pb, 'legacy' AS result_source,
                    e.date AS event_date, e.time AS event_time, e.created_at AS event_created_at, e.id AS event_id,
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
               WHERE (e.workspace_id = $1 OR EXISTS (
                   SELECT 1 FROM event_fixture_workspaces fw
                   JOIN event_participants ep ON ep.event_id = fw.event_id
                     AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
                   WHERE fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
                     AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
                 ))
                 AND a.workspace_id = $1
               AND e.status <> 'cancelled'
               AND r.discipline = $5
             UNION ALL
             SELECT en.athlete_id, NULL::boolean, 'session' AS result_source,
                    e.date AS event_date, e.time AS event_time, e.created_at AS event_created_at, e.id AS event_id,
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
               WHERE r.workspace_id = $1
                 AND d.code = $5
                 AND s.result_state = 'final' AND s.status = 'completed'
                 AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
                 AND se.withdrawn_at IS NULL
                 AND (e.workspace_id = r.workspace_id OR EXISTS (
                   SELECT 1 FROM event_fixture_workspaces fw
                   WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id
                     AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
                 ))
                 AND e.status <> 'cancelled'
           ), windowed AS (
             SELECT history.*,
                    MIN(effective_result) FILTER (WHERE effective_outcome = 'valid')
                      OVER (PARTITION BY athlete_id
                            ORDER BY event_date ASC, event_time ASC NULLS LAST, event_created_at ASC, event_id ASC
                            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS running_pb
             FROM history
           )
           SELECT * FROM windowed
           WHERE ((result_source = 'legacy' AND stored_is_pb)
                  OR (result_source = 'session' AND effective_outcome = 'valid'
                      AND (running_pb IS NULL OR effective_result < running_pb)))
             AND event_date >= $3::date
             AND event_date < $4::date
         ) season_pbs) AS season_pbs`,
       [workspaceId, asOfDate, yearStart, nextYearStart, DISCIPLINE_100M],
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
                WHERE ep.event_id = e.id) AS participant_count,
               (SELECT COUNT(DISTINCT te.athlete_id)
                FROM event_participants ep
                JOIN timeline_entries te
                  ON te.event_id = ep.event_id AND te.athlete_id = ep.athlete_id
                WHERE ep.event_id = e.id
                  AND te.deleted_at IS NULL
                  AND te.discipline = $2) AS athletes_with_entries_count,
               (SELECT COUNT(*)
                FROM event_participants ep
                JOIN results r
                  ON r.event_id = ep.event_id AND r.athlete_id = ep.athlete_id
                WHERE ep.event_id = e.id
                  AND r.discipline = $2
                  AND CASE
                       WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN r.outcome
                       WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN 'valid'
                       ELSE r.outcome
                     END <> 'no_result') AS resolved_results_count,
               (SELECT COUNT(*)
                FROM event_participants ep
                JOIN timeline_entries te
                  ON te.event_id = ep.event_id AND te.athlete_id = ep.athlete_id
                WHERE ep.event_id = e.id
                  AND te.deleted_at IS NULL
                  AND te.discipline = $2) AS entry_count
        FROM events e
         WHERE (e.workspace_id = $1 OR EXISTS (
           SELECT 1 FROM event_fixture_workspaces fw
           WHERE fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
             AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
         ))
          AND e.status = 'in_progress'
         AND e.discipline = $2
       ORDER BY e.date ASC,
                e.time ASC NULLS LAST,
                e.created_at ASC,
                e.id ASC
       LIMIT 1`,
       [workspaceId, DISCIPLINE_100M],
    );
    const activeRow = activeResult.rows[0];
    const activeBase = activeRow ? mapDashboardActiveEventRow(activeRow) : null;
    const latestEntries = activeBase
      ? await client.query<DashboardTimelineEntryRow>(
        `SELECT te.*,
                a.name AS athlete_name,
                 COALESCE((SELECT array_agg(s.name ORDER BY lower(s.name), s.id) FROM athlete_squads axs JOIN squads s ON s.id = axs.squad_id WHERE axs.athlete_id = a.id), ARRAY[]::text[]) AS athlete_squad_names,
                a.archived_at AS athlete_archived_at
            FROM timeline_entries te
            JOIN athletes a ON a.id = te.athlete_id
           WHERE te.event_id = $1
             AND te.deleted_at IS NULL
             AND te.discipline = $2
          ORDER BY te.created_at DESC, te.id DESC
          LIMIT $3`,
          [activeBase.event.id, DISCIPLINE_100M, LATEST_ENTRIES_LIMIT],
      )
      : { rows: [] as DashboardTimelineEntryRow[] };

    const rosterResult = await client.query<RosterSnapshotRow>(
      `SELECT a.id AS athlete_id,
               a.name,
               COALESCE(jsonb_agg(jsonb_build_object('discipline', d.code, 'label', d.presentation->>'label', 'unit', d.unit, 'precision', d.precision, 'pb', best.pb) ORDER BY d.presentation->>'label') FILTER (WHERE d.id IS NOT NULL), '[]'::jsonb) AS disciplines
        FROM athletes a
        LEFT JOIN athlete_preferred_disciplines preferences ON preferences.athlete_id = a.id
        LEFT JOIN discipline_definitions d ON d.id = preferences.discipline_definition_id
       LEFT JOIN LATERAL (
         SELECT MIN(result_value) FILTER (WHERE outcome_value = 'valid') AS pb FROM (
           SELECT CASE
                    WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN NULL
                    WHEN r.manual_override IS NOT NULL AND r.manual_override > 0
                      THEN r.manual_override
                    ELSE r.final_result
                  END AS result_value,
                  CASE
                    WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN r.outcome
                    WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN 'valid'
                    ELSE r.outcome
                  END AS outcome_value
           FROM results r
           JOIN events e ON e.id = r.event_id
           WHERE r.athlete_id = a.id
              AND r.discipline = d.code
               AND (e.workspace_id = $1 OR EXISTS (
                 SELECT 1 FROM event_fixture_workspaces fw
                 JOIN event_participants ep ON ep.event_id = fw.event_id
                   AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
                 WHERE fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
                   AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
               ))
             AND e.status <> 'cancelled'
           UNION ALL
           SELECT CASE
                    WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN NULL
                    WHEN r.manual_override IS NOT NULL AND r.manual_override > 0
                      THEN r.manual_override
                    ELSE r.final_result
                  END AS result_value,
                  CASE
                    WHEN r.outcome IN ('dq', 'dnf', 'dns') THEN r.outcome
                    WHEN r.manual_override IS NOT NULL AND r.manual_override > 0 THEN 'valid'
                    ELSE r.outcome
                  END AS outcome_value
           FROM session_results r
           JOIN discipline_sessions s ON s.id = r.session_id
            JOIN discipline_definitions session_definition ON session_definition.id = s.discipline_definition_id
           JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
           JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
           JOIN events e ON e.id = r.event_id
           WHERE en.athlete_id = a.id
              AND session_definition.code = d.code
               AND r.workspace_id = $1
               AND s.result_state = 'final' AND s.status = 'completed'
               AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
               AND se.withdrawn_at IS NULL
               AND (e.workspace_id = r.workspace_id OR EXISTS (
                 SELECT 1 FROM event_fixture_workspaces fw
                 WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id
                   AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
               ))
             AND e.status <> 'cancelled'
         ) merged
        ) best ON d.id IS NOT NULL
          WHERE a.workspace_id = $1 AND a.lifecycle_status = 'active'
        GROUP BY a.id
        ORDER BY LOWER(a.name) ASC, a.created_at ASC, a.id ASC`,
        [workspaceId],
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
        LEFT JOIN athletes a ON a.id = ep.athlete_id AND a.workspace_id = $1
        WHERE e.workspace_id = $1
         AND e.status = 'scheduled'
          AND e.date >= $2::date
          AND e.date <= ($2::date + INTERVAL '7 days')
       GROUP BY e.id
       ORDER BY e.date ASC,
                e.time ASC NULLS LAST,
                e.created_at ASC,
                e.id ASC`,
        [workspaceId, asOfDate],
    );

    const recentResults = await listRecentResults(client, workspaceId, false, RECENT_RESULTS_LIMIT, season);
    const recentPbs = await listRecentResults(client, workspaceId, true, RECENT_PBS_LIMIT, season);

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
