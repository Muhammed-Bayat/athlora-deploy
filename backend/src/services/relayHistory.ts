import { getPool, type DbExecutor } from '../db/client.js';
import { getAthlete } from './athletes.js';

export interface AthleteRelayHistoryEntry {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  disciplineSessionId: string;
  sessionLabel: string;
  disciplineCode: string;
  teamName: string;
  leg: number;
  outcome: string;
  teamResult: number | null;
  countsAsIndividualResult: false;
}

export async function athleteRelayHistory(
  workspaceId: string,
  athleteId: unknown,
  db: DbExecutor = getPool(),
): Promise<AthleteRelayHistoryEntry[]> {
  await getAthlete(workspaceId, athleteId, db);
  const result = await db.query<{
    event_id: string; event_title: string; event_date: string; session_id: string; session_label: string;
    code: string; team_name: string; leg: number; outcome: string; final_result: string | null;
  }>(
    `SELECT e.id AS event_id, e.title AS event_title, to_char(e.date, 'YYYY-MM-DD') AS event_date,
            s.id AS session_id, s.label AS session_label, d.code,
            team.name AS team_name, rm.leg, COALESCE(r.outcome, 'no_result') AS outcome, r.final_result
     FROM relay_members rm
     JOIN meet_entrants team ON team.id = rm.relay_id AND team.event_id = rm.event_id
     JOIN meet_entrants member ON member.id = rm.member_id AND member.event_id = rm.event_id
     JOIN events e ON e.id = team.event_id
     JOIN session_entrants sr ON sr.entrant_id = team.id AND sr.withdrawn_at IS NULL
     JOIN discipline_sessions s ON s.id = sr.session_id AND s.event_id = e.id
     JOIN discipline_definitions d ON d.id = s.discipline_definition_id
     LEFT JOIN session_results r ON r.session_id = s.id AND r.entrant_id = team.id
     WHERE member.athlete_id = $1 AND member.workspace_id = $2 AND d.kind = 'relay'
     ORDER BY e.date DESC, s.created_at, rm.leg`,
    [athleteId as string, workspaceId],
  );
  return result.rows.map((row) => ({
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventDate: row.event_date,
    disciplineSessionId: row.session_id,
    sessionLabel: row.session_label,
    disciplineCode: row.code,
    teamName: row.team_name,
    leg: Number(row.leg),
    outcome: row.outcome,
    teamResult: row.final_result === null ? null : Number(row.final_result),
    countsAsIndividualResult: false as const,
  }));
}
