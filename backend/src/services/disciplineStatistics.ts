import type { DbExecutor } from '../db/client.js';
import type { DisciplineDefinition } from '../types/meets.js';
import { SUPPORTED_DISCIPLINE_SQL_LIST } from './disciplineCatalog.js';

/** A live relation, not an eventually consistent cache: finalization/reopen changes
 * all statistics visibility in the same commit as results and places. */
export const FINAL_INDIVIDUAL_PERFORMANCES = `SELECT r.workspace_id, en.athlete_id, a.name AS athlete_name,
  d.code, d.unit AS discipline_unit, d.precision, d.direction, d.presentation->>'label' AS label,
  e.date AS event_date, r.final_result, r.session_id
  FROM session_results r
  JOIN discipline_sessions s ON s.id = r.session_id
  JOIN discipline_definitions d ON d.id = s.discipline_definition_id
  JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
  JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
  JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
  JOIN events e ON e.id = r.event_id
  WHERE s.result_state = 'final' AND s.status = 'completed' AND e.status <> 'cancelled'
    AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
    AND d.code IN (${SUPPORTED_DISCIPLINE_SQL_LIST})
    AND se.withdrawn_at IS NULL AND r.outcome = 'valid' AND r.final_result IS NOT NULL
    AND a.lifecycle_status <> 'archived'
    AND (e.workspace_id = r.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id
      AND fw.workspace_id = r.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))`;

/** Official relay leg splits from final sessions. A leg counts on its own validity, so it
 * survives a later team DQ, and the team total is never part of this relation. */
export const FINAL_RELAY_LEG_PERFORMANCES = `SELECT en.workspace_id, en.athlete_id, a.name AS athlete_name,
  d.code, d.unit AS discipline_unit, d.precision, d.direction, d.presentation->>'label' AS label,
  e.date AS event_date, t.value AS final_result, t.session_id
  FROM session_timeline_entries t
  JOIN session_relay_selections rs ON rs.entry_id = t.id AND rs.session_id = t.session_id AND rs.entrant_id = t.entrant_id AND rs.event_id = t.event_id
  JOIN relay_members rm ON rm.id = rs.relay_member_id AND rm.relay_id = rs.entrant_id AND rm.event_id = rs.event_id
  JOIN discipline_sessions s ON s.id = rs.session_id
  JOIN discipline_definitions d ON d.id = s.discipline_definition_id
  JOIN session_entrants se ON se.session_id = rs.session_id AND se.entrant_id = rs.entrant_id
  JOIN meet_entrants en ON en.id = rm.member_id AND en.event_id = rm.event_id AND en.workspace_id = rm.workspace_id
  JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = en.workspace_id
  JOIN events e ON e.id = t.event_id
  WHERE s.result_state = 'final' AND s.status = 'completed' AND e.status <> 'cancelled'
    AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'relay'
    AND d.code IN (${SUPPORTED_DISCIPLINE_SQL_LIST})
    AND se.withdrawn_at IS NULL AND t.deleted_at IS NULL
    AND t.entry_type = 'attempt' AND t.value > 0 AND NOT t.is_foul AND t.incident_type IS NULL
    AND a.lifecycle_status <> 'archived'
    AND (e.workspace_id = en.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id
      AND fw.workspace_id = en.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))`;

export const FINAL_PERFORMANCES = `((${FINAL_INDIVIDUAL_PERFORMANCES}) UNION ALL (${FINAL_RELAY_LEG_PERFORMANCES}))`;

export interface PriorPerformance { value: number; date: string; }

/** Prior official relay-leg performances for the given athletes in one relay discipline. */
export async function relayLegHistory(
  db: DbExecutor,
  params: { workspaceId: string; code: string; athleteIds: readonly string[]; excludeSessionId: string; eventDate: string },
): Promise<Map<string, PriorPerformance[]>> {
  const history = new Map<string, PriorPerformance[]>();
  if (params.athleteIds.length === 0) return history;
  const result = await db.query<{ athlete_id: string; final_result: string; event_date: string }>(
    `WITH performances AS (${FINAL_PERFORMANCES})
     SELECT athlete_id, final_result, to_char(event_date, 'YYYY-MM-DD') AS event_date FROM performances
     WHERE workspace_id = $1 AND code = $2 AND athlete_id = ANY($3::uuid[]) AND session_id <> $4 AND event_date <= $5::date`,
    [params.workspaceId, params.code, [...params.athleteIds], params.excludeSessionId, params.eventDate],
  );
  for (const row of result.rows) {
    const list = history.get(row.athlete_id) ?? [];
    list.push({ value: Number(row.final_result), date: row.event_date });
    history.set(row.athlete_id, list);
  }
  return history;
}

export function performanceFlags(value: number, prior: readonly PriorPerformance[], direction: DisciplineDefinition['direction'], year: string): { isPb: boolean; isSb: boolean } {
  const better = (h: PriorPerformance) => direction === 'lower' ? value < h.value : value > h.value;
  return { isPb: prior.every(better), isSb: prior.filter(h => h.date.slice(0, 4) === year).every(better) };
}

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
  }>(`WITH performances AS (${FINAL_PERFORMANCES}), aggregates AS (
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
