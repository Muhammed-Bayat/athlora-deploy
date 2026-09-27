import { getPool, type DbExecutor } from '../db/client.js';
import { parseSeasonYear } from './seasons.js';

export interface PublicClubStanding {
  clubId: string;
  clubName: string;
  totalPoints: number;
  fixtures: number;
  wins: number;
  seconds: number;
  thirds: number;
  scoredResults: number;
  rank: number;
}

export async function getPublicClubStandings(seasonValue?: string, db: DbExecutor = getPool()): Promise<PublicClubStanding[]> {
  const season = parseSeasonYear(seasonValue);
  const params: unknown[] = [];
  const seasonCondition = season.selected === 'all' ? '' : (() => {
    params.push(season.startDate, season.endDate);
    return ` AND e.date >= $1::date AND e.date < $2::date`;
  })();
  const result = await db.query<{
    club_id: string; club_name: string; total_points: string; fixtures: string; wins: string;
    seconds: string; thirds: string; scored_results: string; rank: string;
  }>(`
    WITH eligible_fixture_workspaces AS (
      SELECT fw.event_id, fw.workspace_id
      FROM event_fixture_workspaces fw
      JOIN events e ON e.id = fw.event_id
      WHERE e.status = 'completed'
        AND (fw.role = 'host' OR (fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))
        ${seasonCondition}
        AND EXISTS (
          SELECT 1 FROM event_fixture_workspaces guest
          WHERE guest.event_id = e.id AND guest.role = 'guest'
            AND guest.status = 'accepted' AND guest.accepted_revision = e.fixture_revision
        )
    ), fixture_totals AS (
      SELECT workspace_id, COUNT(DISTINCT event_id) AS fixtures
      FROM eligible_fixture_workspaces
      GROUP BY workspace_id
    ), scored AS (
      SELECT r.workspace_id,
             COUNT(*) FILTER (WHERE r.final_place = 1) AS wins,
             COUNT(*) FILTER (WHERE r.final_place = 2) AS seconds,
             COUNT(*) FILTER (WHERE r.final_place = 3) AS thirds,
             COUNT(*) FILTER (WHERE r.final_place BETWEEN 1 AND 3) AS scored_results,
             COALESCE(SUM(CASE r.final_place WHEN 1 THEN 5 WHEN 2 THEN 3 WHEN 3 THEN 1 ELSE 0 END), 0) AS total_points
      FROM session_results r
      JOIN eligible_fixture_workspaces fw ON fw.event_id = r.event_id AND fw.workspace_id = r.workspace_id
      JOIN discipline_sessions s ON s.id = r.session_id
      JOIN discipline_definitions d ON d.id = s.discipline_definition_id
      JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
      JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
      WHERE s.result_state = 'final' AND s.status = 'completed'
        AND r.outcome = 'valid' AND r.final_result IS NOT NULL
        AND r.final_place BETWEEN 1 AND 3 AND se.withdrawn_at IS NULL
        AND ((d.default_rules->>'entrantType' = 'individual' AND en.kind = 'athlete')
          OR (d.default_rules->>'entrantType' = 'relay' AND en.kind = 'relay'))
      GROUP BY r.workspace_id
    ), totals AS (
      SELECT c.id AS club_id, c.name AS club_name, f.fixtures,
             COALESCE(s.total_points, 0) AS total_points, COALESCE(s.wins, 0) AS wins,
             COALESCE(s.seconds, 0) AS seconds, COALESCE(s.thirds, 0) AS thirds,
             COALESCE(s.scored_results, 0) AS scored_results
      FROM fixture_totals f
      JOIN clubs c ON c.workspace_id = f.workspace_id AND c.public_results_enabled = true
      LEFT JOIN scored s ON s.workspace_id = f.workspace_id
    )
    SELECT *, RANK() OVER (ORDER BY total_points DESC, wins DESC, seconds DESC, thirds DESC) AS rank
    FROM totals
    ORDER BY total_points DESC, wins DESC, seconds DESC, thirds DESC, lower(club_name), club_id
   `, params);
  return result.rows.map((row) => ({
    clubId: row.club_id, clubName: row.club_name, totalPoints: Number(row.total_points), fixtures: Number(row.fixtures),
    wins: Number(row.wins), seconds: Number(row.seconds), thirds: Number(row.thirds),
    scoredResults: Number(row.scored_results), rank: Number(row.rank),
  }));
}
