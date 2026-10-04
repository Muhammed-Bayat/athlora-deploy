import type { DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import type { SeasonScope } from './seasons.js';
import { FINAL_RELAY_LEG_PERFORMANCES } from './disciplineStatistics.js';

export interface DisciplineProgressionDetail {
  entries: Array<{ eventId: string; eventDate: string; eventTitle: string; value: number; isNewPb: boolean }>;
  summary: { personalBest: number | null; resultCount: number };
}

export async function getDisciplineProgression(
  db: DbExecutor,
  workspaceId: string,
  athleteId: string,
  disciplineDefinitionId: string,
  season: SeasonScope,
): Promise<DisciplineProgressionDetail> {
  if (![workspaceId, athleteId, disciplineDefinitionId].every(isCanonicalUuid)) {
    throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  }

  const params: unknown[] = [workspaceId, athleteId, disciplineDefinitionId];
  const seasonCondition = season.selected === 'all'
    ? ''
    : `AND e.date >= $${params.push(season.startDate!)}::date AND e.date < $${params.push(season.endDate!)}::date`;
  const relaySeasonCondition = season.selected === 'all'
    ? ''
    : `AND legs.event_date >= $${params.push(season.startDate!)}::date AND legs.event_date < $${params.push(season.endDate!)}::date`;
  const result = await db.query<{
    event_id: string; event_date: string; event_title: string; value: string; is_new_pb: boolean; personal_best: string | null; result_count: string;
  }>(`WITH performances AS (
    SELECT e.id AS event_id, e.date AS event_date, e.title AS event_title, COALESCE(r.manual_override, r.final_result) AS value, d.direction
    FROM results r
    JOIN athletes a ON a.id = r.athlete_id AND a.workspace_id = $1
    JOIN discipline_definitions d ON d.id = $3 AND d.code = r.discipline
    JOIN events e ON e.id = r.event_id AND e.status <> 'cancelled'
    WHERE r.athlete_id = $2 AND r.discipline = '100m'
      AND r.outcome = 'valid' AND COALESCE(r.manual_override, r.final_result) IS NOT NULL
      AND (e.workspace_id = $1 OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw
        JOIN event_participants ep ON ep.event_id = fw.event_id AND ep.athlete_id = r.athlete_id
          AND ep.participant_workspace_id = fw.workspace_id
        WHERE fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
          AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))
      ${seasonCondition}
    UNION ALL
    SELECT e.id AS event_id, e.date AS event_date, e.title AS event_title, COALESCE(r.manual_override, r.final_result) AS value, d.direction
    FROM session_results r
    JOIN discipline_sessions s ON s.id = r.session_id
    JOIN discipline_definitions d ON d.id = s.discipline_definition_id
    JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id AND se.withdrawn_at IS NULL
    JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
    JOIN events e ON e.id = r.event_id AND e.status <> 'cancelled'
    WHERE r.workspace_id = $1 AND en.athlete_id = $2 AND s.discipline_definition_id = $3
      AND s.status = 'completed' AND s.result_state = 'final' AND en.kind = 'athlete'
      AND r.outcome = 'valid' AND r.final_result IS NOT NULL
      AND (e.workspace_id = r.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id
        AND fw.workspace_id = r.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))
      ${seasonCondition}
    UNION ALL
    SELECT legs.event_id, legs.event_date, legs.event_title, legs.final_result AS value, legs.direction
    FROM (${FINAL_RELAY_LEG_PERFORMANCES}) legs
    WHERE legs.workspace_id = $1 AND legs.athlete_id = $2 AND legs.discipline_definition_id = $3
      ${relaySeasonCondition}
  ), ranked AS (
    SELECT *, CASE WHEN direction = 'lower' THEN MIN(value) OVER (ORDER BY event_date, event_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
      ELSE MAX(value) OVER (ORDER BY event_date, event_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) END AS prior_pb
    FROM performances
  ), summary AS (
    SELECT CASE WHEN MAX(direction) = 'lower' THEN MIN(value) ELSE MAX(value) END AS personal_best, COUNT(*) AS result_count FROM performances
  )
  SELECT ranked.*, summary.personal_best, summary.result_count,
    (ranked.prior_pb IS NULL OR (ranked.direction = 'lower' AND ranked.value < ranked.prior_pb) OR (ranked.direction = 'higher' AND ranked.value > ranked.prior_pb)) AS is_new_pb
  FROM ranked CROSS JOIN summary ORDER BY event_date, event_id`, params);

  return {
    entries: result.rows.map((row) => ({ eventId: row.event_id, eventDate: row.event_date, eventTitle: row.event_title, value: Number(row.value), isNewPb: row.is_new_pb })),
    summary: { personalBest: result.rows[0]?.personal_best === null || result.rows[0] === undefined ? null : Number(result.rows[0].personal_best), resultCount: Number(result.rows[0]?.result_count ?? 0) },
  };
}
