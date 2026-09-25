import type { DbExecutor } from '../db/client.js';
import type { DisciplineDefinition } from '../types/meets.js';

/** A live relation, not an eventually consistent cache: finalization/reopen changes
 * all statistics visibility in the same commit as results and places. */
export const FINAL_INDIVIDUAL_PERFORMANCES = `SELECT r.*, en.athlete_id, a.name AS athlete_name,
  d.code, d.unit AS discipline_unit, d.precision, d.direction, d.presentation->>'label' AS label, e.date AS event_date
  FROM session_results r
  JOIN discipline_sessions s ON s.id = r.session_id
  JOIN discipline_definitions d ON d.id = s.discipline_definition_id
  JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
  JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
  JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
  JOIN events e ON e.id = r.event_id
  WHERE s.result_state = 'final' AND s.status = 'completed' AND e.status <> 'cancelled'
    AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
    AND se.withdrawn_at IS NULL AND r.outcome = 'valid' AND r.final_result IS NOT NULL
    AND a.lifecycle_status <> 'archived'
    AND EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id
      AND fw.workspace_id = r.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision)`;

export interface DisciplineAthleteStatistics {
  athleteId: string; athleteName: string; discipline: string; label: string;
  unit: DisciplineDefinition['unit']; direction: DisciplineDefinition['direction']; precision: number;
  pb: number; sb: number | null; resultCount: number; seasonCount: number; seasonAverage: number | null;
  seasonTotal: number | null; placing: number | null;
}
export async function disciplineAthleteStatistics(db: DbExecutor, workspaceId: string, athleteId: string | null, year: number): Promise<DisciplineAthleteStatistics[]> {
  const result = await db.query<{
    athlete_id: string; athlete_name: string; code: string; label: string; discipline_unit: DisciplineDefinition['unit']; direction: DisciplineDefinition['direction']; precision: number;
    pb: string; sb: string | null; result_count: string; season_count: string; season_average: string | null; season_total: string | null; placing: string | null;
  }>(`WITH performances AS (${FINAL_INDIVIDUAL_PERFORMANCES}), aggregates AS (
    SELECT athlete_id, athlete_name, code, label, discipline_unit, direction, precision,
      CASE WHEN direction = 'lower' THEN MIN(final_result) ELSE MAX(final_result) END AS pb,
      CASE WHEN direction = 'lower' THEN MIN(final_result) FILTER (WHERE EXTRACT(YEAR FROM event_date) = $3)
        ELSE MAX(final_result) FILTER (WHERE EXTRACT(YEAR FROM event_date) = $3) END AS sb,
      COUNT(*) AS result_count, COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM event_date) = $3) AS season_count,
      AVG(final_result) FILTER (WHERE EXTRACT(YEAR FROM event_date) = $3) AS season_average,
      SUM(final_result) FILTER (WHERE EXTRACT(YEAR FROM event_date) = $3) AS season_total
    FROM performances WHERE workspace_id = $1 GROUP BY athlete_id, athlete_name, code, label, discipline_unit, direction, precision
  ), ranked AS (SELECT *, CASE WHEN sb IS NOT NULL THEN RANK() OVER (PARTITION BY code ORDER BY
    CASE WHEN direction = 'lower' THEN sb ELSE -sb END ASC NULLS LAST) END AS placing FROM aggregates)
  SELECT * FROM ranked WHERE ($2::uuid IS NULL OR athlete_id = $2) ORDER BY code, ranked.placing NULLS LAST, athlete_id`, [workspaceId, athleteId, year]);
  const number = (value: string | null) => value === null ? null : Number(value);
  return result.rows.map(r => ({ athleteId: r.athlete_id, athleteName: r.athlete_name, discipline: r.code, label: r.label, unit: r.discipline_unit, direction: r.direction, precision: r.precision,
    pb: Number(r.pb), sb: number(r.sb), resultCount: Number(r.result_count), seasonCount: Number(r.season_count), seasonAverage: number(r.season_average), seasonTotal: number(r.season_total), placing: number(r.placing) }));
}
