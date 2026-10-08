import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { AthleteLifecycleStatus, EventStatus, EventType } from '../types/domain.js';
import type { DisciplineDefinition } from '../types/meets.js';
import { isCanonicalUuid } from '../validation/primitives.js';
import { parseSeasonYear, type SeasonScope } from './seasons.js';
import { NON_CANCELLED_EVENT_FILTER } from './disciplineStatistics.js';
import { isSupportedDiscipline, SUPPORTED_DISCIPLINE_CODES } from './disciplineCatalog.js';

const RECENT_RESULT_LIMIT = 5;

export type AnalyticsResultSource = 'legacy_result' | 'session_result';

export interface AnalyticsDiscipline {
  code: string;
  label: string;
  unit: DisciplineDefinition['unit'];
  precision: number;
  direction: DisciplineDefinition['direction'];
}

export interface NormalizedAthleteResult {
  id: string;
  source: AnalyticsResultSource;
  sourceResultId: string;
  athleteId: string;
  discipline: AnalyticsDiscipline;
  event: {
    id: string;
    title: string;
    date: string;
    time: string | null;
    type: EventType;
    status: EventStatus;
  };
  value: number;
  place: number | null;
}

export interface RecentTrend {
  direction: 'improving' | 'steady' | 'declining';
  previousAverage: number;
  recentAverage: number;
  change: number;
  samplesPerWindow: number;
}

export interface AthleteDisciplineAnalytics {
  athleteId: string;
  discipline: AnalyticsDiscipline;
  season: SeasonScope;
  pb: number | null;
  sb: number | null;
  latest: NormalizedAthleteResult | null;
  first: NormalizedAthleteResult | null;
  average: number | null;
  median: number | null;
  improvement: number | null;
  recentTrend: RecentTrend | null;
  resultCount: number;
  recentResults: NormalizedAthleteResult[];
  history: NormalizedAthleteResult[];
}

export interface WorkspaceDisciplineAnalytics {
  discipline: AnalyticsDiscipline;
  season: SeasonScope;
  ranking: DisciplineAnalyticsRanking;
  athletes: RankedDisciplineAthlete[];
}

export interface DisciplineAnalyticsRanking {
  basis: 'pb';
  direction: DisciplineDefinition['direction'];
  ordering: string;
  tieHandling: string;
  unrankedHandling: string;
  factors: readonly ['pb', 'sb', 'latest', 'first', 'average', 'median', 'improvement', 'recentTrend', 'resultCount'];
}

export interface RankedDisciplineAthlete {
  athlete: { id: string; name: string; status: AthleteLifecycleStatus };
  rank: number | null;
  factors: AthleteDisciplineAnalytics;
}

interface DisciplineRow {
  code: string;
  label: string;
  unit: DisciplineDefinition['unit'];
  precision: number | string;
  direction: DisciplineDefinition['direction'];
}

interface ResolvedDiscipline extends AnalyticsDiscipline {
  id: string;
}

interface ResolvedDisciplineRow extends DisciplineRow {
  id: string;
}

interface NormalizedResultRow extends DisciplineRow {
  source: AnalyticsResultSource;
  source_result_id: string;
  athlete_id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  event_time: string | null;
  event_type: EventType;
  event_status: EventStatus;
  result_value: number | string;
  placing: number | string | null;
}

export interface AnalyticsAthlete {
  id: string;
  name: string;
  lifecycle_status: AthleteLifecycleStatus;
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function toDiscipline(row: DisciplineRow): AnalyticsDiscipline {
  return {
    code: row.code,
    label: row.label,
    unit: row.unit,
    precision: Number(row.precision),
    direction: row.direction,
  };
}

function mapNormalizedResult(row: NormalizedResultRow): NormalizedAthleteResult {
  return {
    id: `${row.source}:${row.source_result_id}`,
    source: row.source,
    sourceResultId: row.source_result_id,
    athleteId: row.athlete_id,
    discipline: toDiscipline(row),
    event: {
      id: row.event_id,
      title: row.event_title,
      date: String(row.event_date),
      time: row.event_time,
      type: row.event_type,
      status: row.event_status,
    },
    value: Number(row.result_value),
    place: row.placing === null ? null : Number(row.placing),
  };
}

function compareChronologically(left: NormalizedAthleteResult, right: NormalizedAthleteResult): number {
  const leftKey = `${left.event.date}|${left.event.time ?? '99:99:99'}|${left.event.id}|${left.id}`;
  const rightKey = `${right.event.date}|${right.event.time ?? '99:99:99'}|${right.event.id}|${right.id}`;
  return leftKey.localeCompare(rightKey);
}

function isBetter(left: number, right: number, direction: DisciplineDefinition['direction']): boolean {
  return direction === 'lower' ? left < right : left > right;
}

/** Only a completed competition may mint a personal or seasonal best. */
function countsAsBest(result: NormalizedAthleteResult): boolean {
  return result.event.type === 'competition' && result.event.status === 'completed';
}

function best(results: readonly NormalizedAthleteResult[], direction: DisciplineDefinition['direction']): number | null {
  if (results.length === 0) return null;
  return results.reduce((current, result) => isBetter(result.value, current, direction) ? result.value : current, results[0]!.value);
}

function average(results: readonly NormalizedAthleteResult[], precision: number): number | null {
  if (results.length === 0) return null;
  return round(results.reduce((total, result) => total + result.value, 0) / results.length, precision);
}

function median(results: readonly NormalizedAthleteResult[], precision: number): number | null {
  if (results.length === 0) return null;
  const values = results.map((result) => result.value).sort((left, right) => left - right);
  const midpoint = Math.floor(values.length / 2);
  const value = values.length % 2 === 0
    ? (values[midpoint - 1]! + values[midpoint]!) / 2
    : values[midpoint]!;
  return round(value, precision);
}

function resultFallsInSeason(result: NormalizedAthleteResult, season: SeasonScope): boolean {
  return season.selected === 'all'
    || (result.event.date >= season.startDate! && result.event.date < season.endDate!);
}

function calculateRecentTrend(
  history: readonly NormalizedAthleteResult[],
  discipline: AnalyticsDiscipline,
): RecentTrend | null {
  if (history.length < 2) return null;
  const samplesPerWindow = Math.min(3, Math.floor(history.length / 2));
  const compared = history.slice(-(samplesPerWindow * 2));
  const previousAverage = average(compared.slice(0, samplesPerWindow), discipline.precision)!;
  const recentAverage = average(compared.slice(samplesPerWindow), discipline.precision)!;
  const change = round(
    discipline.direction === 'lower'
      ? previousAverage - recentAverage
      : recentAverage - previousAverage,
    discipline.precision,
  );
  return {
    direction: change > 0 ? 'improving' : change < 0 ? 'declining' : 'steady',
    previousAverage,
    recentAverage,
    change,
    samplesPerWindow,
  };
}

/** Summarizes valid measurements using the catalogue's lower-is-better or higher-is-better rule. */
export function summarizeAthleteDisciplineResults(
  athleteId: string,
  discipline: AnalyticsDiscipline,
  results: readonly NormalizedAthleteResult[],
  season: SeasonScope = parseSeasonYear(undefined),
): AthleteDisciplineAnalytics {
  const history = [...results].sort(compareChronologically);
  const first = history[0] ?? null;
  const latest = history.at(-1) ?? null;
  const seasonResults = history.filter((result) => resultFallsInSeason(result, season));
  const improvement = first && latest && history.length > 1
    ? round(
      discipline.direction === 'lower' ? first.value - latest.value : latest.value - first.value,
      discipline.precision,
    )
    : null;

  return {
    athleteId,
    discipline,
    season,
    pb: best(history.filter(countsAsBest), discipline.direction),
    sb: best(seasonResults.filter(countsAsBest), discipline.direction),
    latest,
    first,
    average: average(history, discipline.precision),
    median: median(history, discipline.precision),
    improvement,
    recentTrend: calculateRecentTrend(history, discipline),
    resultCount: history.length,
    recentResults: history.slice(-RECENT_RESULT_LIMIT).reverse(),
    history,
  };
}

/** Ranks only on a visible personal-best factor; no composite score is calculated. */
export function rankDisciplineAthletes(
  athletes: readonly AnalyticsAthlete[],
  discipline: AnalyticsDiscipline,
  results: readonly NormalizedAthleteResult[],
  season: SeasonScope = parseSeasonYear(undefined),
): RankedDisciplineAthlete[] {
  const resultsByAthlete = new Map<string, NormalizedAthleteResult[]>();
  for (const result of results) {
    const athleteResults = resultsByAthlete.get(result.athleteId) ?? [];
    athleteResults.push(result);
    resultsByAthlete.set(result.athleteId, athleteResults);
  }

  const analyzed = athletes.map((athlete) => ({
    athlete: { id: athlete.id, name: athlete.name, status: athlete.lifecycle_status },
    factors: summarizeAthleteDisciplineResults(athlete.id, discipline, resultsByAthlete.get(athlete.id) ?? [], season),
  }));
  const byName = (left: typeof analyzed[number], right: typeof analyzed[number]) =>
    left.athlete.name.localeCompare(right.athlete.name) || left.athlete.id.localeCompare(right.athlete.id);
  const ranked = analyzed.filter((entry) => entry.factors.pb !== null).sort((left, right) => {
    const resultComparison = discipline.direction === 'lower'
      ? left.factors.pb! - right.factors.pb!
      : right.factors.pb! - left.factors.pb!;
    return resultComparison || byName(left, right);
  });
  const unranked = analyzed.filter((entry) => entry.factors.pb === null).sort(byName);
  let previousPb: number | null = null;
  let previousRank = 0;

  return [
    ...ranked.map((entry, index) => {
      const rank = previousPb === entry.factors.pb ? previousRank : index + 1;
      previousPb = entry.factors.pb;
      previousRank = rank;
      return { ...entry, rank };
    }),
    ...unranked.map((entry) => ({ ...entry, rank: null })),
  ];
}

async function requireAthlete(workspaceId: string, athleteId: unknown, executor: DbExecutor): Promise<{ id: string }> {
  if (!isCanonicalUuid(workspaceId) || !isCanonicalUuid(athleteId)) throw notFound();
  const result = await executor.query<{ id: string }>(
    'SELECT id FROM athletes WHERE id = $1 AND workspace_id = $2',
    [athleteId, workspaceId],
  );
  if (!result.rows[0]) throw notFound();
  return result.rows[0];
}

export async function resolveAnalyticsDiscipline(code: unknown, executor: DbExecutor): Promise<ResolvedDiscipline> {
  if (typeof code !== 'string' || !/^[a-z0-9][a-z0-9_]*$/.test(code) || !isSupportedDiscipline(code)) throw notFound();
  const result = await executor.query<ResolvedDisciplineRow>(
    `SELECT id, code, presentation->>'label' AS label, unit, precision, direction
     FROM discipline_definitions
     WHERE code = $1
     ORDER BY version DESC
     LIMIT 1`,
    [code],
  );
  if (!result.rows[0]) throw notFound();
  return { id: result.rows[0].id, ...toDiscipline(result.rows[0]) };
}

/** Returns the current supported catalogue definitions used by normalized analytics. */
export async function listAnalyticsDisciplines(executor: DbExecutor): Promise<AnalyticsDiscipline[]> {
  const result = await executor.query<DisciplineRow>(
    `SELECT DISTINCT ON (code) code, presentation->>'label' AS label, unit, precision, direction
     FROM discipline_definitions
     WHERE code = ANY($1::text[])
     ORDER BY code, version DESC`,
    [SUPPORTED_DISCIPLINE_CODES],
  );
  return result.rows.map(toDiscipline);
}

function rankingPolicy(discipline: AnalyticsDiscipline): DisciplineAnalyticsRanking {
  return {
    basis: 'pb',
    direction: discipline.direction,
    ordering: discipline.direction === 'lower' ? 'Lower personal-best values rank first' : 'Higher personal-best values rank first',
    tieHandling: 'Equal personal-best values share a rank; name and ID only order tied rows for display',
    unrankedHandling: 'Athletes without a valid result are returned after ranked athletes with rank null',
    factors: ['pb', 'sb', 'latest', 'first', 'average', 'median', 'improvement', 'recentTrend', 'resultCount'],
  };
}

/**
 * This union intentionally reads legacy rows in place. The legacy source has no
 * surrogate key, so its stable composite key is retained as sourceResultId.
 */
const NORMALIZED_RESULTS_QUERY = `
  WITH normalized AS (
    SELECT 'legacy_result'::text AS source,
           concat(r.event_id::text, ':', r.athlete_id::text, ':', r.discipline) AS source_result_id,
           r.athlete_id, r.discipline AS code,
           definitions.presentation->>'label' AS label, definitions.unit, definitions.precision, definitions.direction,
            e.id AS event_id, e.title AS event_title, e.date::text AS event_date, e.time::text AS event_time, e.type AS event_type,
            e.status AS event_status,
            COALESCE(r.manual_override, r.final_result) AS result_value, r."placing" AS placing
    FROM results r
    JOIN athletes a ON a.id = r.athlete_id
    JOIN events e ON e.id = r.event_id
    JOIN LATERAL (
      SELECT code, presentation, unit, precision, direction
      FROM discipline_definitions
      WHERE code = r.discipline
      ORDER BY version DESC
      LIMIT 1
    ) definitions ON true
    WHERE a.workspace_id = $1
      AND r.athlete_id = ANY($3::uuid[])
      AND r.discipline = $2
      AND r.outcome = 'valid'
      AND COALESCE(r.manual_override, r.final_result) IS NOT NULL
      AND ${NON_CANCELLED_EVENT_FILTER}
      AND (e.workspace_id = $1 OR EXISTS (
        SELECT 1
        FROM event_fixture_workspaces fw
        JOIN event_participants ep ON ep.event_id = fw.event_id
          AND ep.athlete_id = r.athlete_id AND ep.participant_workspace_id = fw.workspace_id
        WHERE fw.event_id = e.id AND fw.workspace_id = $1 AND fw.role = 'guest'
          AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
      ))
    UNION ALL
    SELECT 'session_result'::text AS source,
           r.id::text AS source_result_id,
           en.athlete_id, d.code,
           d.presentation->>'label' AS label, d.unit, d.precision, d.direction,
            e.id AS event_id, e.title AS event_title, e.date::text AS event_date, e.time::text AS event_time, e.type AS event_type,
            e.status AS event_status,
            COALESCE(r.manual_override, r.final_result) AS result_value, r.final_place AS placing
    FROM session_results r
    JOIN discipline_sessions s ON s.id = r.session_id
    JOIN discipline_definitions d ON d.id = s.discipline_definition_id
    JOIN session_entrants se ON se.session_id = r.session_id AND se.entrant_id = r.entrant_id
    JOIN meet_entrants en ON en.id = r.entrant_id AND en.workspace_id = r.workspace_id
    JOIN athletes a ON a.id = en.athlete_id AND a.workspace_id = r.workspace_id
    JOIN events e ON e.id = r.event_id
    WHERE r.workspace_id = $1
      AND en.athlete_id = ANY($3::uuid[])
      AND d.code = $2
      AND s.result_state = 'final' AND s.status = 'completed'
      AND en.kind = 'athlete' AND d.default_rules->>'entrantType' = 'individual'
      AND se.withdrawn_at IS NULL
      AND r.outcome = 'valid' AND r.final_result IS NOT NULL
      AND ${NON_CANCELLED_EVENT_FILTER}
      AND (e.workspace_id = r.workspace_id OR EXISTS (
        SELECT 1 FROM event_fixture_workspaces fw
        WHERE fw.event_id = e.id AND fw.workspace_id = r.workspace_id
          AND fw.status = 'accepted' AND fw.accepted_revision = e.fixture_revision
      ))
  )
  SELECT *
  FROM normalized
  ORDER BY event_date ASC, event_time ASC NULLS LAST, event_id ASC, source_result_id ASC
`;

export async function listNormalizedAthleteResults(
  workspaceId: string,
  disciplineCode: string,
  athleteIds: string[],
  executor: DbExecutor,
): Promise<NormalizedAthleteResult[]> {
  if (!isCanonicalUuid(workspaceId)
    || !isSupportedDiscipline(disciplineCode)
    || !athleteIds.every(isCanonicalUuid)) {
    throw notFound();
  }
  if (athleteIds.length === 0) return [];
  const result = await executor.query<NormalizedResultRow>(NORMALIZED_RESULTS_QUERY, [workspaceId, disciplineCode, athleteIds]);
  return result.rows.map(mapNormalizedResult);
}

export async function getAthleteDisciplineAnalytics(
  workspaceId: string,
  athleteId: unknown,
  disciplineCode: unknown,
  season: SeasonScope = parseSeasonYear(undefined),
  executor: DbExecutor = getPool(),
): Promise<AthleteDisciplineAnalytics> {
  const athlete = await requireAthlete(workspaceId, athleteId, executor);
  const resolvedDiscipline = await resolveAnalyticsDiscipline(disciplineCode, executor);
  const discipline = toDiscipline(resolvedDiscipline);
  const results = await listNormalizedAthleteResults(workspaceId, discipline.code, [athlete.id], executor);
  return summarizeAthleteDisciplineResults(athlete.id, discipline, results, season);
}

export async function getWorkspaceDisciplineAnalytics(
  workspaceId: string,
  disciplineCode: unknown,
  season: SeasonScope = parseSeasonYear(undefined),
  executor: DbExecutor = getPool(),
): Promise<WorkspaceDisciplineAnalytics> {
  if (!isCanonicalUuid(workspaceId)) throw notFound();
  const resolvedDiscipline = await resolveAnalyticsDiscipline(disciplineCode, executor);
  const discipline = toDiscipline(resolvedDiscipline);
  const athletes = await executor.query<AnalyticsAthlete>(
    `SELECT a.id, a.name, a.lifecycle_status
     FROM athletes a
     JOIN athlete_preferred_disciplines preferences ON preferences.athlete_id = a.id
     JOIN discipline_definitions preferred_definition ON preferred_definition.id = preferences.discipline_definition_id
     WHERE a.workspace_id = $1
        AND preferred_definition.code = $2
        AND a.lifecycle_status = 'active'
     GROUP BY a.id, a.name, a.lifecycle_status
     ORDER BY lower(a.name), a.id`,
    [workspaceId, discipline.code],
  );
  const results = await listNormalizedAthleteResults(
    workspaceId,
    discipline.code,
    athletes.rows.map((athlete) => athlete.id),
    executor,
  );

  return {
    discipline,
    season,
    ranking: rankingPolicy(discipline),
    athletes: rankDisciplineAthletes(athletes.rows, discipline, results, season),
  };
}
