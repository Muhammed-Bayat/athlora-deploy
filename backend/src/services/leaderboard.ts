import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { DisciplineDefinition } from '../types/meets.js';
import { parseSeasonYear } from './seasons.js';
import { COMPLETED_COMPETITION_FILTER } from './disciplineStatistics.js';
import { isSupportedDiscipline, SUPPORTED_DISCIPLINE_SQL_LIST } from './disciplineCatalog.js';

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

function parseExactAge(value: string | undefined): number | null {
  const age = value?.trim() ?? '';
  if (!age) return null;
  if (!/^(?:[5-9]|[1-9]\d|100)$/.test(age)) {
    throw new ApiError(422, 'LEADERBOARD_FILTER_INVALID', 'Age filter is invalid');
  }
  return Number(age);
}

export async function getPublicLeaderboard(query: LeaderboardQuery, db: DbExecutor = getPool()): Promise<LeaderboardEntry[]> {
  const season = parseSeasonYear(query.season);
  const discipline = query.discipline?.trim() || null;
  const clubId = query.club?.trim() || null;
  const gender = query.gender?.trim() || null;
  const age = parseExactAge(query.age);
  if (discipline && !isSupportedDiscipline(discipline)) {
    throw new ApiError(422, 'LEADERBOARD_FILTER_INVALID', 'Discipline filter is invalid');
  }

  const legacyConditions = [
    `${COMPLETED_COMPETITION_FILTER}`,
    "r.outcome = 'valid'",
    "COALESCE(r.manual_override, r.final_result) > 0",
    "a.lifecycle_status <> 'archived'",
    "c.public_results_enabled = true",
    `r.discipline IN (${SUPPORTED_DISCIPLINE_SQL_LIST})`,
    "(e.workspace_id = a.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw JOIN event_participants ep ON ep.event_id = fw.event_id AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id WHERE fw.event_id = e.id AND fw.workspace_id = a.workspace_id AND fw.role = 'guest' AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))",
  ];
  const sessionConditions = [
    "s.result_state = 'final'",
    "s.status = 'completed'",
    `${COMPLETED_COMPETITION_FILTER}`,
    "en.kind = 'athlete'",
    "d.default_rules->>'entrantType' = 'individual'",
    "se.withdrawn_at IS NULL",
    "r.outcome = 'valid'",
    "r.final_result IS NOT NULL",
    "a.lifecycle_status <> 'archived'",
    "c.public_results_enabled = true",
    `d.code IN (${SUPPORTED_DISCIPLINE_SQL_LIST})`,
    "(e.workspace_id = r.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id AND fw.role = 'guest' AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))",
  ];
  const relayConditions = [
    "s.result_state = 'final'",
    "s.status = 'completed'",
    `${COMPLETED_COMPETITION_FILTER}`,
    "en.kind = 'relay'",
    "d.default_rules->>'entrantType' = 'relay'",
    "se.withdrawn_at IS NULL",
    "r.outcome = 'valid'",
    "r.final_result IS NOT NULL",
    "c.public_results_enabled = true",
    `d.code IN (${SUPPORTED_DISCIPLINE_SQL_LIST})`,
    "(e.workspace_id = r.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id AND fw.role = 'guest' AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))",
  ];
  const params: unknown[] = [];

  if (season.selected !== 'all') {
    params.push(season.startDate, season.endDate);
    legacyConditions.push(`e.date >= $${params.length - 1}::date AND e.date < $${params.length}::date`);
    sessionConditions.push(`e.date >= $${params.length - 1}::date AND e.date < $${params.length}::date`);
    relayConditions.push(`e.date >= $${params.length - 1}::date AND e.date < $${params.length}::date`);
  }
  if (discipline) {
    params.push(discipline);
      legacyConditions.push(`r.discipline = $${params.length}`);
      sessionConditions.push(`(d.code = $${params.length} OR d.id::text = $${params.length})`);
      relayConditions.push(`(d.code = $${params.length} OR d.id::text = $${params.length})`);
  }
  if (clubId) {
    params.push(clubId);
      legacyConditions.push(`c.id = $${params.length}`);
      sessionConditions.push(`c.id = $${params.length}`);
      relayConditions.push(`c.id = $${params.length}`);
  }
  if (gender) {
    params.push(gender);
      legacyConditions.push(`a.gender ILIKE $${params.length}`);
      sessionConditions.push(`a.gender ILIKE $${params.length}`);
      relayConditions.push('FALSE');
  }
  if (age) {
    params.push(age);
    legacyConditions.push(`EXTRACT(YEAR FROM age(e.date, a.dob))::integer = $${params.length}::integer`);
    sessionConditions.push(`EXTRACT(YEAR FROM age(e.date, a.dob))::integer = $${params.length}::integer`);
    relayConditions.push('FALSE');
  }

  const sql = `
    WITH performances AS (
       SELECT COALESCE(r.manual_override, r.final_result) AS final_result,
              concat(r.event_id::text, ':', r.athlete_id::text, ':', r.discipline) AS result_id,
              r.athlete_id, a.name AS athlete_name, a.dob, a.gender,
              c.id AS club_id, c.name AS club_name, r.discipline AS code,
               r.discipline AS label,
              'seconds'::text AS discipline_unit, 2::integer AS precision, 'lower'::text AS direction, e.date AS event_date
       FROM results r
       JOIN athletes a ON a.id = r.athlete_id
       JOIN clubs c ON c.workspace_id = a.workspace_id
       JOIN events e ON e.id = r.event_id
       WHERE ${legacyConditions.join(' AND ')}
       UNION ALL
       SELECT r.final_result, r.id::text AS result_id, en.athlete_id, a.name AS athlete_name, a.dob, a.gender,
              c.id AS club_id, c.name AS club_name, d.code, d.presentation->>'label' AS label,
              d.unit AS discipline_unit, d.precision, d.direction, e.date AS event_date
      FROM session_results r
      JOIN discipline_sessions s ON s.id = r.session_id
      JOIN discipline_definitions d ON d.id = s.discipline_definition_id
      JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
      JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
      JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
      JOIN clubs c ON c.workspace_id = r.workspace_id
      JOIN events e ON e.id = r.event_id
       WHERE ${sessionConditions.join(' AND ')}
       UNION ALL
       SELECT r.final_result, r.id::text AS result_id, en.id AS athlete_id, en.name AS athlete_name,
              NULL::date AS dob, NULL::text AS gender,
              c.id AS club_id, c.name AS club_name, d.code, d.presentation->>'label' AS label,
              d.unit AS discipline_unit, d.precision, d.direction, e.date AS event_date
      FROM session_results r
      JOIN discipline_sessions s ON s.id = r.session_id
      JOIN discipline_definitions d ON d.id = s.discipline_definition_id
      JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
      JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
      JOIN clubs c ON c.workspace_id = r.workspace_id
      JOIN events e ON e.id = r.event_id
       WHERE ${relayConditions.join(' AND ')}
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
