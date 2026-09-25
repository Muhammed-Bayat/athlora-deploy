import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { DisciplineDefinition } from '../types/meets.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { parseSeasonYear } from './seasons.js';

export interface PublicStatisticsReportQuery {
  discipline?: string;
  season?: string;
  age?: string;
  gender?: string;
  club?: string;
}

export interface PublicStatisticsReportEntry {
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
  eventTitle: string;
  eventDate: string;
}

function validateQuery(query: PublicStatisticsReportQuery): void {
  if (query.club?.trim() && !isCanonicalUuid(query.club.trim())) {
    throw new ApiError(422, 'REPORT_FILTER_INVALID', 'Club filter is invalid');
  }
  if (query.gender?.trim() && !['male', 'female'].includes(query.gender.trim().toLowerCase())) {
    throw new ApiError(422, 'REPORT_FILTER_INVALID', 'Gender filter is invalid');
  }
  if (query.age?.trim()) {
    const age = query.age.trim();
    const exact = Number(age);
    const under = age.startsWith('under-') ? Number(age.slice(6)) : NaN;
    if ((!Number.isInteger(exact) || exact < 5 || exact > 100) && (!Number.isInteger(under) || under < 5 || under > 100)) {
      throw new ApiError(422, 'REPORT_FILTER_INVALID', 'Age filter is invalid');
    }
  }
  if (query.discipline !== undefined && query.discipline.trim().length > 64) {
    throw new ApiError(422, 'REPORT_FILTER_INVALID', 'Discipline filter is invalid');
  }
}

export async function getPublicStatisticsReport(
  query: PublicStatisticsReportQuery,
  db: DbExecutor = getPool(),
): Promise<PublicStatisticsReportEntry[]> {
  validateQuery(query);
  const season = parseSeasonYear(query.season);
  const legacyConditions = [
    "e.status = 'completed'",
    "r.outcome = 'valid'",
    "a.lifecycle_status <> 'archived'",
    'c.public_results_enabled = true',
    '(COALESCE(r.manual_override, r.final_result) > 0)',
    "(e.workspace_id = a.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw JOIN event_participants ep ON ep.event_id = fw.event_id AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id WHERE fw.event_id = e.id AND fw.workspace_id = a.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))",
  ];
  const sessionConditions = [
    "s.result_state = 'final'",
    "s.status = 'completed'",
    "e.status <> 'cancelled'",
    "en.kind = 'athlete'",
    "d.default_rules->>'entrantType' = 'individual'",
    'se.withdrawn_at IS NULL',
    "r.outcome = 'valid'",
    'r.final_result IS NOT NULL',
    "a.lifecycle_status <> 'archived'",
    'c.public_results_enabled = true',
    "(e.workspace_id = r.workspace_id OR EXISTS (SELECT 1 FROM event_fixture_workspaces fw WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision))",
  ];
  const params: unknown[] = [];
  const add = (value: unknown) => { params.push(value); return `$${params.length}`; };

  if (season.selected !== 'all') {
    const start = add(season.startDate);
    const end = add(season.endDate);
    legacyConditions.push(`e.date >= ${start}::date AND e.date < ${end}::date`);
    sessionConditions.push(`e.date >= ${start}::date AND e.date < ${end}::date`);
  }
  if (query.discipline?.trim()) {
    const value = add(query.discipline.trim());
    legacyConditions.push(`r.discipline = ${value}`);
    sessionConditions.push(`(d.code = ${value} OR d.id::text = ${value})`);
  }
  if (query.club?.trim()) {
    const value = add(query.club.trim());
    legacyConditions.push(`c.id = ${value}`);
    sessionConditions.push(`c.id = ${value}`);
  }
  if (query.gender?.trim()) {
    const value = add(query.gender.trim());
    legacyConditions.push(`a.gender ILIKE ${value}`);
    sessionConditions.push(`a.gender ILIKE ${value}`);
  }
  if (query.age?.trim()) {
    const age = query.age.trim();
    const value = age.startsWith('under-') ? Number(age.slice(6)) : Number(age);
    const operator = age.startsWith('under-') ? '<=' : '=';
    const parameter = add(value);
    legacyConditions.push(`EXTRACT(YEAR FROM age(e.date, a.dob))::integer ${operator} ${parameter}::integer`);
    sessionConditions.push(`EXTRACT(YEAR FROM age(e.date, a.dob))::integer ${operator} ${parameter}::integer`);
  }

  const result = await db.query<{
    athlete_id: string; athlete_name: string; club_id: string; club_name: string;
    code: string; label: string; discipline_unit: DisciplineDefinition['unit']; precision: string;
    direction: DisciplineDefinition['direction']; final_result: string; place: string;
    event_title: string; event_date: string;
  }>(`
    WITH published_performances AS (
      SELECT COALESCE(r.manual_override, r.final_result) AS final_result, r.athlete_id, a.name AS athlete_name, c.id AS club_id, c.name AS club_name,
             r.discipline AS code, CASE WHEN r.discipline = '100m' THEN '100 metres' ELSE r.discipline END AS label,
             'seconds'::text AS discipline_unit, 2::integer AS precision, 'lower'::text AS direction,
             e.title AS event_title, e.date AS event_date
      FROM results r
      JOIN athletes a ON a.id = r.athlete_id
      JOIN clubs c ON c.workspace_id = a.workspace_id
      JOIN events e ON e.id = r.event_id
      WHERE ${legacyConditions.join(' AND ')}
      UNION ALL
      SELECT r.final_result, en.athlete_id, a.name AS athlete_name, c.id AS club_id, c.name AS club_name,
             d.code, d.presentation->>'label' AS label, d.unit AS discipline_unit, d.precision, d.direction,
             e.title AS event_title, e.date AS event_date
      FROM session_results r
      JOIN discipline_sessions s ON s.id = r.session_id
      JOIN discipline_definitions d ON d.id = s.discipline_definition_id
      JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
      JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
      JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
      JOIN clubs c ON c.workspace_id = r.workspace_id
      JOIN events e ON e.id = r.event_id
      WHERE ${sessionConditions.join(' AND ')}
    )
    SELECT *, RANK() OVER (PARTITION BY code ORDER BY CASE WHEN direction = 'lower' THEN final_result ELSE -final_result END ASC) AS place
    FROM published_performances
    ORDER BY code, place ASC, event_date DESC, lower(athlete_name), athlete_id
  `, params);

  return result.rows.map((row) => ({
    athleteId: row.athlete_id,
    athleteName: row.athlete_name,
    clubId: row.club_id,
    clubName: row.club_name,
    discipline: row.code,
    label: row.label,
    unit: row.discipline_unit,
    precision: Number(row.precision),
    direction: row.direction,
    performance: Number(row.final_result),
    place: Number(row.place),
    eventTitle: row.event_title,
    eventDate: row.event_date,
  }));
}
