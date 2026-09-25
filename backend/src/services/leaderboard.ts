import { getPool, type DbExecutor } from '../db/client.js';
import type { DisciplineDefinition } from '../types/meets.js';
import { parseSeasonYear } from './seasons.js';

export interface LeaderboardQuery {
  discipline?: string;
  season?: string;
  age?: string;
  gender?: string;
  club?: string;
}

export interface LeaderboardEntry {
  athleteId: string;
  athleteName: string;
  clubId: string;
  clubName: string;
  discipline: string;
  label: string;
  unit: DisciplineDefinition['unit'];
  precision: number;
  direction: DisciplineDefinition['direction'];
  performance: number;
  place: number;
  season: string | null;
  gender: string | null;
  age: number | null;
}

export async function getPublicLeaderboard(query: LeaderboardQuery, db: DbExecutor = getPool()): Promise<LeaderboardEntry[]> {
  const season = parseSeasonYear(query.season);
  const discipline = query.discipline?.trim() || null;
  const clubId = query.club?.trim() || null;
  const gender = query.gender?.trim() || null;
  const age = query.age?.trim() || null;

  const conditions = [
    "s.result_state = 'final'",
    "s.status = 'completed'",
    "e.status <> 'cancelled'",
    "en.kind = 'athlete'",
    "d.default_rules->>'entrantType' = 'individual'",
    "se.withdrawn_at IS NULL",
    "r.outcome = 'valid'",
    "r.final_result IS NOT NULL",
    "a.lifecycle_status <> 'archived'",
    "c.public_results_enabled = true",
    "EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision)"
  ];
  const params: unknown[] = [];

  if (season.selected !== 'all') {
    params.push(season.startDate, season.endDate);
    conditions.push(`e.date >= $${params.length - 1}::date AND e.date < $${params.length}::date`);
  }
  if (discipline) {
    params.push(discipline);
    conditions.push(`(d.code = $${params.length} OR d.id::text = $${params.length})`);
  }
  if (clubId) {
    params.push(clubId);
    conditions.push(`c.id = $${params.length}`);
  }
  if (gender) {
    params.push(gender);
    conditions.push(`a.gender ILIKE $${params.length}`);
  }
  if (age) {
    const numericAge = Number(age);
    if (!Number.isNaN(numericAge)) {
      params.push(numericAge);
      conditions.push(`EXTRACT(YEAR FROM age(e.date, a.dob))::integer = $${params.length}::integer`);
    } else if (age.startsWith('under-')) {
      const maxAge = Number(age.replace('under-', ''));
      if (!Number.isNaN(maxAge)) {
        params.push(maxAge);
        conditions.push(`EXTRACT(YEAR FROM age(e.date, a.dob))::integer <= $${params.length}::integer`);
      }
    }
  }

  const sql = `
    WITH performances AS (
      SELECT r.final_result, r.id AS result_id, en.athlete_id, a.name AS athlete_name, a.dob, a.gender,
             c.id AS club_id, c.name AS club_name, d.code, d.unit AS discipline_unit, d.precision, d.direction,
             d.presentation->>'label' AS label, e.date AS event_date
      FROM session_results r
      JOIN discipline_sessions s ON s.id = r.session_id
      JOIN discipline_definitions d ON d.id = s.discipline_definition_id
      JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
      JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
      JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
      JOIN clubs c ON c.workspace_id = r.workspace_id
      JOIN events e ON e.id = r.event_id
      WHERE ${conditions.join(' AND ')}
    ), best_per_athlete AS (
      SELECT athlete_id,
             (ARRAY_AGG(athlete_name ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS athlete_name,
             (ARRAY_AGG(club_id ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS club_id,
             (ARRAY_AGG(club_name ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS club_name,
             (ARRAY_AGG(code ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS code,
             (ARRAY_AGG(label ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS label,
             (ARRAY_AGG(discipline_unit ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS discipline_unit,
             (ARRAY_AGG(precision ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS precision,
             (ARRAY_AGG(direction ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS direction,
             (ARRAY_AGG(gender ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS gender,
             (ARRAY_AGG(dob ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC, event_date DESC, result_id DESC))[1] AS dob,
             CASE WHEN direction = 'lower' THEN MIN(final_result) ELSE MAX(final_result) END AS best_result
      FROM performances
      GROUP BY athlete_id, code, direction
    ), ranked AS (
      SELECT *,
             RANK() OVER (PARTITION BY code ORDER BY CASE WHEN direction = 'lower' THEN best_result ELSE -best_result END ASC) AS place
      FROM best_per_athlete
    )
    SELECT * FROM ranked
    ORDER BY code, place ASC, lower(athlete_name) ASC, athlete_id ASC
  `;

  const result = await db.query<{
    athlete_id: string;
    athlete_name: string;
    club_id: string;
    club_name: string;
    code: string;
    label: string;
    discipline_unit: DisciplineDefinition['unit'];
    precision: string;
    direction: DisciplineDefinition['direction'];
    best_result: string;
    place: string;
    gender: string | null;
    dob: string | null;
  }>(sql, params);

  return result.rows.map(r => ({
    athleteId: r.athlete_id,
    athleteName: r.athlete_name,
    clubId: r.club_id,
    clubName: r.club_name,
    discipline: r.code,
    label: r.label,
    unit: r.discipline_unit,
    precision: Number(r.precision),
    direction: r.direction,
    performance: Number(r.best_result),
    place: Number(r.place),
    season: season.selected === 'all' ? null : String(season.selected),
    gender: r.gender,
    age: r.dob ? Math.floor((Date.now() - new Date(r.dob).getTime()) / 31557600000) : null,
  }));
}
