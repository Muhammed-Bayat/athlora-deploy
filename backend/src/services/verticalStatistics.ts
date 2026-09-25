import type { DbExecutor } from '../db/client.js';

export interface VerticalAthleteStatistics { athleteId: string; discipline: string; unit: 'metres'; precision: number; pb: number; sb: number | null; resultCount: number }
/** Only finalized, non-withdrawn, valid authoritative clearances enter this relation. */
export const VERTICAL_PERFORMANCES = `SELECT r.*, en.athlete_id, d.code, d.precision, e.date AS event_date
  FROM session_results r
  JOIN discipline_sessions s ON s.id = r.session_id
  JOIN discipline_definitions d ON d.id = s.discipline_definition_id
  JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
  JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
  JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
  JOIN events e ON e.id = r.event_id
  WHERE d.kind = 'vertical' AND s.status = 'completed' AND s.result_state = 'final' AND e.status <> 'cancelled'
    AND se.withdrawn_at IS NULL AND r.outcome = 'valid' AND r.final_result IS NOT NULL
    AND a.lifecycle_status <> 'archived'
    AND EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id
      AND fw.workspace_id = r.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision)`;

export async function verticalAthleteStatistics(db: DbExecutor, workspaceId: string, athleteId: string | null, year: number): Promise<VerticalAthleteStatistics[]> {
  const result = await db.query<{ athlete_id: string; code: string; precision: number; pb: string; sb: string | null; result_count: string }>(
    `WITH performances AS (${VERTICAL_PERFORMANCES}) SELECT athlete_id, code, precision,
      MAX(final_result) AS pb, MAX(final_result) FILTER (WHERE EXTRACT(YEAR FROM event_date) = $3) AS sb,
      COUNT(*) AS result_count FROM performances WHERE workspace_id = $1 AND ($2::uuid IS NULL OR athlete_id = $2)
      GROUP BY athlete_id, code, precision ORDER BY code, athlete_id`, [workspaceId, athleteId, year]);
  return result.rows.map(r => ({ athleteId: r.athlete_id, discipline: r.code, unit: 'metres', precision: r.precision, pb: Number(r.pb), sb: r.sb === null ? null : Number(r.sb), resultCount: Number(r.result_count) }));
}

export function verticalRecords(value: number | null, finalized: boolean, date: string, history: readonly { value: number; date: string }[]) {
  if (!finalized || value === null) return { isPb: false, isSb: false };
  const prior = history.filter(h => h.date <= date);
  return { isPb: prior.every(h => value > h.value), isSb: prior.filter(h => h.date.slice(0, 4) === date.slice(0, 4)).every(h => value > h.value) };
}
