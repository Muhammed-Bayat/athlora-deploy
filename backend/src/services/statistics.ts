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
import { getAthlete } from './athletes.js';
import { parseSeasonYear, type SeasonScope } from './seasons.js';

const RECENT_RESULTS_PER_TYPE = 10;

type ReadTransactionRunner = <T>(
  operation: (client: DbExecutor) => Promise<T>,
) => Promise<T>;

function utcDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getAthleteStatisticsDetail(
  workspaceId: string,
  athleteId: unknown,
  asOfDate = utcDateToday(),
  runTransaction: ReadTransactionRunner = withReadTransaction,
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<AthleteStatisticsDetail> {
  void asOfDate;
  const [yearStart, nextYearStart] = season.selected === 'all'
    ? ['0001-01-01', '9999-12-31']
    : [season.startDate!, season.endDate!];

  return runTransaction(async (client) => {
    const athlete = await getAthlete(workspaceId, athleteId, client);
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
                END AS effective_outcome,
                e.status = 'completed' AND e.type = 'competition' AS counts_for_best
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
         UNION ALL
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
                END AS effective_outcome,
                e.status = 'completed' AND e.type = 'competition' AS counts_for_best
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
                  AND e.counts_for_best
              ) AS pb,
              MIN(e.effective_result) FILTER (
                WHERE e.effective_outcome = 'valid'
                  AND e.counts_for_best
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
        WHERE a.id = $1 AND a.workspace_id = $2
       GROUP BY a.id, a.updated_at`,
      [
        athlete.id,
         workspaceId,
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
                END AS effective_outcome,
                NULL::text AS note,
                NULL::jsonb AS relay
         FROM results r
         JOIN events e ON e.id = r.event_id
         JOIN athletes a ON a.id = r.athlete_id
         WHERE r.athlete_id = $1
            AND a.workspace_id = $2
            -- Multi-discipline meet events carry no legacy logger discipline; any legacy row
            -- on one is an attendance artefact (outcome 'no_result') rather than a performance.
            AND e.discipline IS NOT NULL
             AND (e.workspace_id = $2 OR EXISTS (
               SELECT 1 FROM event_fixture_workspaces fw
               JOIN event_participants ep ON ep.event_id = fw.event_id
                 AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
               WHERE fw.event_id = e.id AND fw.workspace_id = $2 AND fw.role = 'guest'
                 AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
              ))
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
                END AS effective_outcome,
                NULL::text AS note,
                NULL::jsonb AS relay
         FROM session_results r
         JOIN discipline_sessions s ON s.id = r.session_id
         JOIN discipline_definitions d ON d.id = s.discipline_definition_id
         JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
         JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
         JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
         JOIN events e ON e.id = r.event_id
         WHERE en.athlete_id = $1
            AND r.workspace_id = $2
             AND s.result_state = 'final' AND s.status = 'completed'
             AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
             AND se.withdrawn_at IS NULL
             AND (e.workspace_id = r.workspace_id OR EXISTS (
               SELECT 1 FROM event_fixture_workspaces fw
               WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id
                 AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
             ))
           AND e.date >= $4::date AND e.date < $5::date
        UNION ALL
        -- Relay team result attributed to each member athlete (the mark the squad ran).
        SELECT r.event_id, a.id AS athlete_id, d.code, r.final_result,
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
                END AS effective_outcome,
                NULL::text AS note,
                -- One row per relay: the squad line-up and every leg split ride along so the
                -- log can render the team mark and its legs together instead of as two rows.
                jsonb_build_object(
                  'teamName', en.name,
                  'members', (
                    SELECT COALESCE(jsonb_agg(
                      CASE WHEN rm2.member_kind = 'athlete' THEN ma.name ELSE me2.name END
                      ORDER BY rm2.leg), '[]'::jsonb)
                    FROM relay_members rm2
                    JOIN meet_entrants me2 ON me2.id = rm2.member_id AND me2.event_id = rm2.event_id
                      AND me2.workspace_id = rm2.workspace_id
                    LEFT JOIN athletes ma ON ma.id = me2.athlete_id
                    WHERE rm2.relay_id = en.id AND rm2.event_id = r.event_id
                      AND rm2.workspace_id = r.workspace_id
                  ),
                  'legs', (
                    SELECT COALESCE(jsonb_agg(
                      jsonb_build_object(
                        'leg', rm2.leg,
                        'name', CASE WHEN rm2.member_kind = 'athlete' THEN ma.name ELSE me2.name END,
                        'value', CASE
                          WHEN t2.value IS NOT NULL AND t2.value > 0 AND NOT t2.is_foul
                            AND t2.incident_type IS NULL AND t2.deleted_at IS NULL
                            THEN t2.value
                        END)
                      ORDER BY rm2.leg), '[]'::jsonb)
                    FROM relay_members rm2
                    JOIN meet_entrants me2 ON me2.id = rm2.member_id AND me2.event_id = rm2.event_id
                      AND me2.workspace_id = rm2.workspace_id
                    LEFT JOIN athletes ma ON ma.id = me2.athlete_id
                    LEFT JOIN session_relay_selections rs2 ON rs2.relay_member_id = rm2.id
                      AND rs2.session_id = r.session_id AND rs2.entrant_id = r.entrant_id
                      AND rs2.event_id = r.event_id AND rs2.workspace_id = r.workspace_id
                    LEFT JOIN session_timeline_entries t2 ON t2.id = rs2.entry_id
                    WHERE rm2.relay_id = en.id AND rm2.event_id = r.event_id
                      AND rm2.workspace_id = r.workspace_id
                  )
                ) AS relay
         FROM session_results r
         JOIN discipline_sessions s ON s.id = r.session_id
         JOIN discipline_definitions d ON d.id = s.discipline_definition_id
         JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
         JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
         JOIN relay_members rm ON rm.relay_id = en.id AND rm.event_id = r.event_id
           AND rm.workspace_id = r.workspace_id AND rm.member_kind = 'athlete'
         JOIN meet_entrants mem ON mem.id = rm.member_id AND mem.event_id = rm.event_id
           AND mem.workspace_id = rm.workspace_id
         JOIN athletes a ON a.id = mem.athlete_id AND a.workspace_id = mem.workspace_id
         JOIN events e ON e.id = r.event_id
         WHERE a.id = $1
           AND r.workspace_id = $2
            AND s.result_state = 'final' AND s.status = 'completed'
            AND en.kind = 'relay' AND d.default_rules->>'entrantType' = 'relay'
            AND se.withdrawn_at IS NULL
            AND (e.workspace_id = r.workspace_id OR EXISTS (
              SELECT 1 FROM event_fixture_workspaces fw
              WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id
                AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
            ))
          AND e.date >= $4::date AND e.date < $5::date
        ), selected AS (
         (SELECT * FROM history
          WHERE event_type = 'competition'
          ORDER BY event_date DESC, event_time DESC NULLS LAST, event_created_at DESC, event_id DESC
          LIMIT $3)
         UNION
         (SELECT * FROM history
          WHERE event_type = 'training'
          ORDER BY event_date DESC, event_time DESC NULLS LAST, event_created_at DESC, event_id DESC
          LIMIT $3)
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
        [athlete.id, workspaceId, RECENT_RESULTS_PER_TYPE, yearStart, nextYearStart],
    );
    const history = historyResult.rows.map(mapAthleteResultHistoryRow);
    const statistics = mapAthleteStatisticsRow(statisticsRow);

    return {
      ...statistics,
      athlete: {
        id: athlete.id,
        name: athlete.name,
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
