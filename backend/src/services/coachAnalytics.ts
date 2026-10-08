import { getPool, type DbExecutor } from '../db/client.js';
import { ApiError } from '../middleware/errors.js';
import type { AthleteLifecycleStatus, InjuryRegion, InjurySide, InjurySeverity } from '../types/domain.js';
import { isCanonicalUuid, isGregorianDate } from '../validation/primitives.js';
import {
  listAnalyticsDisciplines,
  listNormalizedAthleteResults,
  resolveAnalyticsDiscipline,
  summarizeAthleteDisciplineResults,
  type AnalyticsAthlete,
  type AnalyticsDiscipline,
  type NormalizedAthleteResult,
  type RecentTrend,
} from './athleteAnalytics.js';
import { parseSeasonYear, type SeasonScope } from './seasons.js';

const COMPACT_HISTORY_LIMIT = 50;
const CONSISTENCY_MINIMUM_SAMPLES = 3;
const PLATEAU_MINIMUM_SAMPLES = 4;
const MAX_COACH_ATHLETE_IDS = 100;
const MAX_COACH_RANKING_LIMIT = 100;
const RANKING_WEIGHTS = {
  standing: 0.45,
  improvementPercent: 0.25,
  consistency: 0.20,
  resultCount: 0.10,
} as const;

export type CoachLifecycleStatus = 'active' | 'inactive' | 'all';

export interface CoachDateRange {
  dateFrom: string | null;
  dateTo: string | null;
}

export interface CoachPerformanceQuery {
  athleteIds?: string[];
  discipline?: string;
  dateRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
}

export interface CoachInjuryQuery {
  athleteIds?: string[];
  dateRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
}

export interface CoachRankingsQuery {
  discipline: string;
  dateRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
  limit: number;
}

interface CoachAthlete extends AnalyticsAthlete {
  name: string;
}

export interface CoachPerformanceResultPoint {
  date: string;
  time: string | null;
  value: number;
  event: {
    id: string;
    title: string;
    type: NormalizedAthleteResult['event']['type'];
  };
}

export interface CoachConsistency {
  sampleCount: number;
  standardDeviation: number;
  relativeVolatilityPercent: number | null;
}

export interface CoachPlateau {
  status: 'plateaued' | 'not_plateaued';
  reason: string;
  change: number;
  samplesPerWindow: number;
}

export interface CoachPerformanceDisciplineAnalysis {
  discipline: AnalyticsDiscipline;
  recordCount: number;
  first: CoachPerformanceResultPoint | null;
  latest: CoachPerformanceResultPoint | null;
  best: {
    personalBest: number | null;
    seasonBest: number | null;
    selectedRangeBest: number | null;
    season: SeasonScope;
  };
  improvement: number | null;
  improvementPercent: number | null;
  recentTrend: RecentTrend | null;
  consistency: CoachConsistency | null;
  plateau: CoachPlateau | null;
  sufficientData: boolean;
  insufficientDataReason: string | null;
  history: CoachPerformanceResultPoint[];
}

export interface CoachPerformanceAnalytics {
  selectedRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
  athletes: Array<{
    athlete: { id: string; name: string; status: AthleteLifecycleStatus };
    disciplines: CoachPerformanceDisciplineAnalysis[];
  }>;
}

export interface CoachInjuryHistoryEntry {
  bodyRegion: InjuryRegion;
  area: string;
  side: InjurySide;
  severity: InjurySeverity;
  occurrenceDate: string | null;
  expectedReturnDate: string | null;
  resolvedDate: string | null;
  active: boolean;
}

export interface CoachInjuryWarning {
  level: 'low' | 'moderate' | 'high';
  reasons: Array<
    | 'active_severe_injury'
    | 'multiple_active_injuries'
    | 'active_moderate_injury'
    | 'overdue_expected_return'
    | 'repeated_same_area'
    | 'clustered_injuries'
    | 'recent_recorded_injury'
    | 'active_minor_injury'
    | 'recorded_history_only'
    | 'no_recorded_injuries'
  >;
}

export interface CoachInjuryAnalytics {
  selectedRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
  limitations: readonly [
    'Indicators summarize recorded injuries only; they are not medical diagnoses or probability estimates.',
    'No workload, readiness, attendance, treatment, or recovery data is available to these indicators.',
  ];
  athletes: Array<{
    athlete: { id: string; name: string; status: AthleteLifecycleStatus };
    injuryCount: number;
    activeInjuryCount: number;
    mostCommonRecordedArea: { bodyRegion: InjuryRegion; area: string; count: number } | null;
    repeatedInjuries: Array<{ bodyRegion: InjuryRegion; area: string; side: InjurySide; count: number }>;
    warning: CoachInjuryWarning;
    history: CoachInjuryHistoryEntry[];
  }>;
}

interface RankingFactor<T> {
  value: T | null;
  score: number | null;
  includedInScore: boolean;
  insufficientDataReason: string | null;
}

export interface CoachRankingEntry {
  athlete: { id: string; name: string; status: AthleteLifecycleStatus };
  rank: number | null;
  score: number | null;
  includedFactors: Array<keyof typeof RANKING_WEIGHTS>;
  sufficientData: boolean;
  insufficientDataReason: string | null;
  factors: {
    standing: RankingFactor<number> & {
      personalBest: number | null;
      current: number | null;
      standingRank: number | null;
    };
    improvementPercent: RankingFactor<number>;
    consistency: RankingFactor<CoachConsistency>;
    resultCount: RankingFactor<number>;
  };
}

export interface CoachRankingsAnalytics {
  discipline: AnalyticsDiscipline;
  selectedRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
  limit: number;
  scoring: {
    direction: AnalyticsDiscipline['direction'];
    weights: typeof RANKING_WEIGHTS;
    missingFactorHandling: 'Factors without enough athlete or comparison data are omitted from the weighted score.';
    ordering: 'Higher score ranks first; ties use discipline standing, athlete name, then athlete ID.';
  };
  athletes: CoachRankingEntry[];
}

interface InjuryRow {
  athlete_id: string;
  body_region: InjuryRegion;
  area: string;
  side: InjurySide;
  severity: InjurySeverity;
  occurrence_date: string | null;
  expected_return_date: string | null;
  resolved_date: string | null;
}

interface RankingDraft {
  athlete: CoachAthlete;
  score: number | null;
  includedFactors: Array<keyof typeof RANKING_WEIGHTS>;
  sufficientData: boolean;
  insufficientDataReason: string | null;
  factors: CoachRankingEntry['factors'];
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Resource not found');
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percentage(value: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return round((value / Math.abs(baseline)) * 100, 2);
}

function resultIsInRange(result: NormalizedAthleteResult, range: CoachDateRange): boolean {
  return (range.dateFrom === null || result.event.date >= range.dateFrom)
    && (range.dateTo === null || result.event.date <= range.dateTo);
}

function asPerformancePoint(result: NormalizedAthleteResult): CoachPerformanceResultPoint {
  return {
    date: result.event.date,
    time: result.event.time,
    value: result.value,
    event: {
      id: result.event.id,
      title: result.event.title,
      type: result.event.type,
    },
  };
}

function compactHistory(results: readonly NormalizedAthleteResult[]): CoachPerformanceResultPoint[] {
  if (results.length <= COMPACT_HISTORY_LIMIT) return results.map(asPerformancePoint);

  const indices = new Set<number>();
  for (let index = 0; index < COMPACT_HISTORY_LIMIT; index += 1) {
    indices.add(Math.round((index * (results.length - 1)) / (COMPACT_HISTORY_LIMIT - 1)));
  }
  return [...indices].sort((left, right) => left - right).map((index) => asPerformancePoint(results[index]!));
}

function calculateConsistency(
  results: readonly NormalizedAthleteResult[],
  precision: number,
): CoachConsistency | null {
  if (results.length < CONSISTENCY_MINIMUM_SAMPLES) return null;
  const values = results.map((result) => result.value);
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  return {
    sampleCount: values.length,
    standardDeviation: round(standardDeviation, precision),
    relativeVolatilityPercent: average === 0 ? null : round((standardDeviation / Math.abs(average)) * 100, 2),
  };
}

function calculatePlateau(
  results: readonly NormalizedAthleteResult[],
  discipline: AnalyticsDiscipline,
  season: SeasonScope,
): CoachPlateau | null {
  if (results.length < PLATEAU_MINIMUM_SAMPLES) return null;
  const trend = summarizeAthleteDisciplineResults(
    results[0]!.athleteId,
    discipline,
    results.slice(-PLATEAU_MINIMUM_SAMPLES),
    season,
  ).recentTrend!;
  const tolerance = 1 / (10 ** discipline.precision);
  const plateaued = Math.abs(trend.change) <= tolerance;
  return {
    status: plateaued ? 'plateaued' : 'not_plateaued',
    reason: plateaued
      ? 'The latest two-result average changed by no more than one displayed precision increment.'
      : 'The latest two-result average changed by more than one displayed precision increment.',
    change: trend.change,
    samplesPerWindow: trend.samplesPerWindow,
  };
}

function directionalImprovement(
  first: NormalizedAthleteResult | null,
  latest: NormalizedAthleteResult | null,
  discipline: AnalyticsDiscipline,
): number | null {
  if (!first || !latest || first.id === latest.id) return null;
  return round(
    discipline.direction === 'lower' ? first.value - latest.value : latest.value - first.value,
    discipline.precision,
  );
}

/** Creates a direction-aware, date-filtered analysis from normalized results only. */
export function analyzeCoachPerformance(
  discipline: AnalyticsDiscipline,
  allResults: readonly NormalizedAthleteResult[],
  dateRange: CoachDateRange,
  season: SeasonScope = parseSeasonYear(undefined),
): CoachPerformanceDisciplineAnalysis {
  const selected = allResults.filter((result) => resultIsInRange(result, dateRange));
  const athleteId = allResults[0]?.athleteId ?? selected[0]?.athleteId ?? '';
  const fullSummary = summarizeAthleteDisciplineResults(athleteId, discipline, allResults, season);
  const selectedSummary = summarizeAthleteDisciplineResults(athleteId, discipline, selected, season);
  const improvement = directionalImprovement(selectedSummary.first, selectedSummary.latest, discipline);

  return {
    discipline,
    recordCount: selectedSummary.resultCount,
    first: selectedSummary.first ? asPerformancePoint(selectedSummary.first) : null,
    latest: selectedSummary.latest ? asPerformancePoint(selectedSummary.latest) : null,
    best: {
      personalBest: fullSummary.pb,
      seasonBest: fullSummary.sb,
      selectedRangeBest: selectedSummary.pb,
      season,
    },
    improvement,
    improvementPercent: improvement === null || selectedSummary.first === null
      ? null
      : percentage(improvement, selectedSummary.first.value),
    recentTrend: selectedSummary.recentTrend,
    consistency: calculateConsistency(selectedSummary.history, discipline.precision),
    plateau: calculatePlateau(selectedSummary.history, discipline, season),
    sufficientData: selectedSummary.resultCount >= 2,
    insufficientDataReason: selectedSummary.resultCount >= 2
      ? null
      : selectedSummary.resultCount === 0
        ? 'No valid normalized results exist in the selected range.'
        : 'At least two valid normalized results in the selected range are required to compare change.',
    history: compactHistory(selectedSummary.history),
  };
}

function requireValidScope(workspaceId: string, athleteIds?: readonly string[]): void {
  if (!isCanonicalUuid(workspaceId) || athleteIds?.some((id) => !isCanonicalUuid(id))) throw notFound();
  if (athleteIds && (athleteIds.length > MAX_COACH_ATHLETE_IDS || new Set(athleteIds).size !== athleteIds.length)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed');
  }
}

function requireValidFilters(dateRange: CoachDateRange, lifecycleStatus: CoachLifecycleStatus): void {
  if ((dateRange.dateFrom !== null && !isGregorianDate(dateRange.dateFrom))
    || (dateRange.dateTo !== null && !isGregorianDate(dateRange.dateTo))
    || (dateRange.dateFrom !== null && dateRange.dateTo !== null && dateRange.dateFrom > dateRange.dateTo)
    || !['active', 'inactive', 'all'].includes(lifecycleStatus)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed');
  }
}

async function listCoachAthletes(
  workspaceId: string,
  athleteIds: string[] | undefined,
  lifecycleStatus: CoachLifecycleStatus,
  executor: DbExecutor,
  disciplineCode?: string,
): Promise<CoachAthlete[]> {
  requireValidScope(workspaceId, athleteIds);
  const parameters: unknown[] = [workspaceId];
  const conditions = ['a.workspace_id = $1', "a.lifecycle_status <> 'archived'"];
  let joins = '';

  if (athleteIds !== undefined) {
    parameters.push(athleteIds);
    conditions.push(`a.id = ANY($${parameters.length}::uuid[])`);
  }
  if (lifecycleStatus !== 'all') {
    parameters.push(lifecycleStatus);
    conditions.push(`a.lifecycle_status = $${parameters.length}`);
  }
  if (disciplineCode) {
    parameters.push(disciplineCode);
    joins = `JOIN athlete_preferred_disciplines preferences ON preferences.athlete_id = a.id
      JOIN discipline_definitions definition ON definition.id = preferences.discipline_definition_id
        AND definition.code = $${parameters.length}`;
  }

  const result = await executor.query<CoachAthlete>(
    `SELECT DISTINCT a.id, a.name, a.lifecycle_status
     FROM athletes a
     ${joins}
     WHERE ${conditions.join('\n       AND ')}
     ORDER BY lower(a.name), a.id`,
    parameters,
  );
  return result.rows;
}

function groupResultsByAthlete(
  results: readonly NormalizedAthleteResult[],
): Map<string, NormalizedAthleteResult[]> {
  const grouped = new Map<string, NormalizedAthleteResult[]>();
  for (const result of results) {
    const athleteResults = grouped.get(result.athleteId) ?? [];
    athleteResults.push(result);
    grouped.set(result.athleteId, athleteResults);
  }
  return grouped;
}

export async function getCoachPerformanceAnalytics(
  workspaceId: string,
  query: CoachPerformanceQuery,
  executor: DbExecutor = getPool(),
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<CoachPerformanceAnalytics> {
  requireValidFilters(query.dateRange, query.lifecycleStatus);
  const athletes = await listCoachAthletes(workspaceId, query.athleteIds, query.lifecycleStatus, executor);
  const disciplines = query.discipline
    ? [await resolveAnalyticsDiscipline(query.discipline, executor)]
    : await listAnalyticsDisciplines(executor);
  const resultsByDiscipline = new Map<string, Map<string, NormalizedAthleteResult[]>>();
  const athleteIds = athletes.map((athlete) => athlete.id);

  for (const discipline of disciplines) {
    const results = await listNormalizedAthleteResults(workspaceId, discipline.code, athleteIds, executor);
    resultsByDiscipline.set(discipline.code, groupResultsByAthlete(results));
  }

  return {
    selectedRange: query.dateRange,
    lifecycleStatus: query.lifecycleStatus,
    athletes: athletes.map((athlete) => {
      const analyses = disciplines.flatMap((discipline) => {
        const results = resultsByDiscipline.get(discipline.code)?.get(athlete.id) ?? [];
        if (!query.discipline && results.length === 0) return [];
        return [analyzeCoachPerformance(discipline, results, query.dateRange, season)];
      });
      return {
        athlete: { id: athlete.id, name: athlete.name, status: athlete.lifecycle_status },
        disciplines: analyses,
      };
    }),
  };
}

function scoreRelativeValues<T>(
  entries: Array<{ draft: RankingDraft; value: number; factor: RankingFactor<T> }>,
  higherIsBetter: boolean,
): void {
  if (entries.length < 2) {
    for (const entry of entries) entry.factor.insufficientDataReason = 'At least two athletes with this factor are required for a comparative score.';
    return;
  }
  const values = entries.map((entry) => entry.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    for (const entry of entries) entry.factor.insufficientDataReason = 'This factor has no variation among eligible athletes.';
    return;
  }
  for (const entry of entries) {
    const ratio = higherIsBetter
      ? (entry.value - minimum) / (maximum - minimum)
      : (maximum - entry.value) / (maximum - minimum);
    entry.factor.score = round(ratio * 100, 2);
    entry.factor.includedInScore = true;
    entry.factor.insufficientDataReason = null;
  }
}

function scoreStanding(drafts: RankingDraft[], direction: AnalyticsDiscipline['direction']): void {
  const eligible = drafts
    .filter((draft) => draft.factors.standing.personalBest !== null)
    .sort((left, right) => {
      const difference = direction === 'lower'
        ? left.factors.standing.personalBest! - right.factors.standing.personalBest!
        : right.factors.standing.personalBest! - left.factors.standing.personalBest!;
      return difference || left.athlete.name.localeCompare(right.athlete.name) || left.athlete.id.localeCompare(right.athlete.id);
    });
  let priorValue: number | null = null;
  let priorRank = 0;
  for (const [index, draft] of eligible.entries()) {
    const value = draft.factors.standing.personalBest!;
    const rank = value === priorValue ? priorRank : index + 1;
    draft.factors.standing.standingRank = rank;
    priorValue = value;
    priorRank = rank;
  }
  scoreRelativeValues(
    eligible.map((draft) => ({ draft, value: draft.factors.standing.personalBest!, factor: draft.factors.standing })),
    direction === 'higher',
  );
}

function scoreDrafts(drafts: RankingDraft[], direction: AnalyticsDiscipline['direction']): void {
  scoreStanding(drafts, direction);
  scoreRelativeValues(
    drafts.flatMap((draft) => draft.factors.improvementPercent.value === null
      ? []
      : [{ draft, value: draft.factors.improvementPercent.value, factor: draft.factors.improvementPercent }]),
    true,
  );
  scoreRelativeValues(
    drafts.flatMap((draft) => {
      const consistency = draft.factors.consistency.value;
      return consistency?.relativeVolatilityPercent === null || consistency === null
        ? []
        : [{ draft, value: consistency.relativeVolatilityPercent, factor: draft.factors.consistency }];
    }),
    false,
  );
  scoreRelativeValues(
    drafts.flatMap((draft) => draft.factors.resultCount.value === null
      ? []
      : [{ draft, value: draft.factors.resultCount.value, factor: draft.factors.resultCount }]),
    true,
  );

  for (const draft of drafts) {
    const scored = Object.entries(RANKING_WEIGHTS).flatMap(([key, weight]) => {
      const factor = draft.factors[key as keyof typeof RANKING_WEIGHTS];
      return factor.includedInScore && factor.score !== null ? [{ key: key as keyof typeof RANKING_WEIGHTS, weight, score: factor.score }] : [];
    });
    const weightTotal = scored.reduce((total, factor) => total + factor.weight, 0);
    draft.includedFactors = scored.map((factor) => factor.key);
    draft.score = weightTotal === 0
      ? null
      : round(scored.reduce((total, factor) => total + factor.score * factor.weight, 0) / weightTotal, 2);
    draft.sufficientData = draft.score !== null;
    draft.insufficientDataReason = draft.score === null
      ? 'No comparable recorded-performance factors are available for this athlete.'
      : null;
  }
}

/** Ranks one discipline only; scores use no data outside that discipline. */
export function rankCoachAthletes(
  athletes: readonly AnalyticsAthlete[],
  discipline: AnalyticsDiscipline,
  results: readonly NormalizedAthleteResult[],
  dateRange: CoachDateRange,
  season: SeasonScope = parseSeasonYear(undefined),
): CoachRankingEntry[] {
  const resultsByAthlete = groupResultsByAthlete(results);
  const drafts: RankingDraft[] = athletes.map((athlete) => {
    const selected = (resultsByAthlete.get(athlete.id) ?? []).filter((result) => resultIsInRange(result, dateRange));
    const summary = summarizeAthleteDisciplineResults(athlete.id, discipline, selected, season);
    const improvement = directionalImprovement(summary.first, summary.latest, discipline);
    const consistency = calculateConsistency(selected, discipline.precision);
    const personalBest = summary.pb;
    const resultCount = selected.length;
    return {
      athlete,
      score: null,
      includedFactors: [],
      sufficientData: false,
      insufficientDataReason: null,
      factors: {
        standing: {
          value: personalBest,
          personalBest,
          current: summary.latest?.value ?? null,
          standingRank: null,
          score: null,
          includedInScore: false,
          insufficientDataReason: personalBest === null
            ? 'A valid completed-competition result is required for personal-best standing.'
            : null,
        },
        improvementPercent: {
          value: improvement === null || summary.first === null ? null : percentage(improvement, summary.first.value),
          score: null,
          includedInScore: false,
          insufficientDataReason: selected.length < 2
            ? 'At least two valid normalized results are required for improvement.'
            : null,
        },
        consistency: {
          value: consistency,
          score: null,
          includedInScore: false,
          insufficientDataReason: consistency === null
            ? `At least ${CONSISTENCY_MINIMUM_SAMPLES} valid normalized results are required for consistency.`
            : null,
        },
        resultCount: {
          value: resultCount === 0 ? null : resultCount,
          score: null,
          includedInScore: false,
          insufficientDataReason: resultCount === 0 ? 'No valid normalized results exist in the selected range.' : null,
        },
      },
    };
  });

  scoreDrafts(drafts, discipline.direction);
  const ordered = drafts.sort((left, right) => {
    if (left.score !== null && right.score !== null) {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0) return scoreDifference;
    } else if (left.score !== null) return -1;
    else if (right.score !== null) return 1;
    const standingDifference = (left.factors.standing.standingRank ?? Number.MAX_SAFE_INTEGER)
      - (right.factors.standing.standingRank ?? Number.MAX_SAFE_INTEGER);
    return standingDifference || left.athlete.name.localeCompare(right.athlete.name) || left.athlete.id.localeCompare(right.athlete.id);
  });
  let previousScore: number | null = null;
  let previousRank = 0;

  return ordered.map((draft, index) => {
    const rank = draft.score === null
      ? null
      : draft.score === previousScore ? previousRank : index + 1;
    if (rank !== null) {
      previousScore = draft.score;
      previousRank = rank;
    }
    return {
      athlete: { id: draft.athlete.id, name: draft.athlete.name, status: draft.athlete.lifecycle_status },
      rank,
      score: draft.score,
      includedFactors: draft.includedFactors,
      sufficientData: draft.sufficientData,
      insufficientDataReason: draft.insufficientDataReason,
      factors: draft.factors,
    };
  });
}

export async function getCoachRankingsAnalytics(
  workspaceId: string,
  query: CoachRankingsQuery,
  executor: DbExecutor = getPool(),
  season: SeasonScope = parseSeasonYear(undefined),
): Promise<CoachRankingsAnalytics> {
  requireValidScope(workspaceId);
  requireValidFilters(query.dateRange, query.lifecycleStatus);
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_COACH_RANKING_LIMIT) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed');
  }
  const resolved = await resolveAnalyticsDiscipline(query.discipline, executor);
  const discipline: AnalyticsDiscipline = {
    code: resolved.code,
    label: resolved.label,
    unit: resolved.unit,
    precision: resolved.precision,
    direction: resolved.direction,
  };
  const athletes = await listCoachAthletes(workspaceId, undefined, query.lifecycleStatus, executor, discipline.code);
  const results = await listNormalizedAthleteResults(workspaceId, discipline.code, athletes.map((athlete) => athlete.id), executor);
  return {
    discipline,
    selectedRange: query.dateRange,
    lifecycleStatus: query.lifecycleStatus,
    limit: query.limit,
    scoring: {
      direction: discipline.direction,
      weights: RANKING_WEIGHTS,
      missingFactorHandling: 'Factors without enough athlete or comparison data are omitted from the weighted score.',
      ordering: 'Higher score ranks first; ties use discipline standing, athlete name, then athlete ID.',
    },
    athletes: rankCoachAthletes(athletes, discipline, results, query.dateRange, season).slice(0, query.limit),
  };
}

function dateDifferenceInDays(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / 86_400_000);
}

function repeatedInjuries(history: readonly CoachInjuryHistoryEntry[]): Array<{ bodyRegion: InjuryRegion; area: string; side: InjurySide; count: number }> {
  const grouped = new Map<string, { bodyRegion: InjuryRegion; area: string; side: InjurySide; count: number }>();
  for (const injury of history) {
    const key = `${injury.bodyRegion}\u0000${injury.area}\u0000${injury.side}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { bodyRegion: injury.bodyRegion, area: injury.area, side: injury.side, count: 1 });
  }
  return [...grouped.values()]
    .filter((injury) => injury.count >= 2)
    .sort((left, right) => right.count - left.count
      || left.bodyRegion.localeCompare(right.bodyRegion)
      || left.area.localeCompare(right.area)
      || left.side.localeCompare(right.side));
}

function commonInjuryArea(history: readonly CoachInjuryHistoryEntry[]): { bodyRegion: InjuryRegion; area: string; count: number } | null {
  const grouped = new Map<string, { bodyRegion: InjuryRegion; area: string; count: number }>();
  for (const injury of history) {
    const key = `${injury.bodyRegion}\u0000${injury.area}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { bodyRegion: injury.bodyRegion, area: injury.area, count: 1 });
  }
  return [...grouped.values()].sort((left, right) => right.count - left.count
    || left.bodyRegion.localeCompare(right.bodyRegion)
    || left.area.localeCompare(right.area))[0] ?? null;
}

function hasClusteredInjuries(history: readonly CoachInjuryHistoryEntry[]): boolean {
  const dated = history.flatMap((injury) => injury.occurrenceDate ? [injury.occurrenceDate] : []).sort();
  return dated.some((date, index) => index > 0 && dateDifferenceInDays(dated[index - 1]!, date) <= 30);
}

function warningForInjuries(
  history: readonly CoachInjuryHistoryEntry[],
  repeats: readonly { bodyRegion: InjuryRegion; area: string; side: InjurySide; count: number }[],
  today: string,
): CoachInjuryWarning {
  const active = history.filter((injury) => injury.active);
  const hasSevere = active.some((injury) => injury.severity === 'Severe');
  const hasModerate = active.some((injury) => injury.severity === 'Moderate');
  const hasMinor = active.some((injury) => injury.severity === 'Minor');
  const overdue = active.some((injury) => injury.expectedReturnDate !== null && injury.expectedReturnDate < today);
  const recent = history.some((injury) => {
    if (injury.occurrenceDate === null) return false;
    const ageInDays = dateDifferenceInDays(injury.occurrenceDate, today);
    return ageInDays >= 0 && ageInDays <= 30;
  });
  const clustered = hasClusteredInjuries(history);
  const reasons: CoachInjuryWarning['reasons'] = [];

  if (hasSevere) reasons.push('active_severe_injury');
  if (active.length >= 2) reasons.push('multiple_active_injuries');
  if (hasModerate) reasons.push('active_moderate_injury');
  if (overdue) reasons.push('overdue_expected_return');
  if (repeats.length > 0) reasons.push('repeated_same_area');
  if (clustered) reasons.push('clustered_injuries');
  if (recent) reasons.push('recent_recorded_injury');
  if (hasMinor) reasons.push('active_minor_injury');

  const level = hasSevere || active.length >= 2
    ? 'high'
    : hasModerate || overdue || repeats.length > 0 || clustered || recent
      ? 'moderate'
      : 'low';
  if (reasons.length === 0) reasons.push(history.length === 0 ? 'no_recorded_injuries' : 'recorded_history_only');
  return { level, reasons };
}

/** Builds non-diagnostic injury summaries from the minimal analytics-safe injury fields. */
export function summarizeCoachInjuries(
  athletes: readonly AnalyticsAthlete[],
  injuries: readonly (CoachInjuryHistoryEntry & { athleteId: string })[],
  now = new Date(),
): CoachInjuryAnalytics['athletes'] {
  const injuriesByAthlete = new Map<string, CoachInjuryHistoryEntry[]>();
  for (const injury of injuries) {
    const history = injuriesByAthlete.get(injury.athleteId) ?? [];
    history.push({
      bodyRegion: injury.bodyRegion,
      area: injury.area,
      side: injury.side,
      severity: injury.severity,
      occurrenceDate: injury.occurrenceDate,
      expectedReturnDate: injury.expectedReturnDate,
      resolvedDate: injury.resolvedDate,
      active: injury.active,
    });
    injuriesByAthlete.set(injury.athleteId, history);
  }
  const today = now.toISOString().slice(0, 10);
  return athletes.map((athlete) => {
    const history = injuriesByAthlete.get(athlete.id) ?? [];
    const repeats = repeatedInjuries(history);
    return {
      athlete: { id: athlete.id, name: athlete.name, status: athlete.lifecycle_status },
      injuryCount: history.length,
      activeInjuryCount: history.filter((injury) => injury.active).length,
      mostCommonRecordedArea: commonInjuryArea(history),
      repeatedInjuries: repeats,
      warning: warningForInjuries(history, repeats, today),
      history,
    };
  });
}

export async function getCoachInjuryAnalytics(
  workspaceId: string,
  query: CoachInjuryQuery,
  executor: DbExecutor = getPool(),
  now = new Date(),
): Promise<CoachInjuryAnalytics> {
  requireValidFilters(query.dateRange, query.lifecycleStatus);
  const athletes = await listCoachAthletes(workspaceId, query.athleteIds, query.lifecycleStatus, executor);
  const parameters: unknown[] = [workspaceId, athletes.map((athlete) => athlete.id)];
  const conditions = ['i.workspace_id = $1', 'i.deleted_at IS NULL', 'i.athlete_id = ANY($2::uuid[])'];
  if (query.dateRange.dateFrom !== null) {
    parameters.push(query.dateRange.dateFrom);
    conditions.push(`i.occurrence_date >= $${parameters.length}::date`);
  }
  if (query.dateRange.dateTo !== null) {
    parameters.push(query.dateRange.dateTo);
    conditions.push(`i.occurrence_date <= $${parameters.length}::date`);
  }
  const result = athletes.length === 0
    ? { rows: [] as InjuryRow[] }
    : await executor.query<InjuryRow>(
      `SELECT i.athlete_id, i.body_region, i.area, i.side, i.severity,
              i.occurrence_date::text AS occurrence_date,
              i.expected_return_date::text AS expected_return_date,
              i.resolved_date::date::text AS resolved_date
       FROM athlete_injuries i
       WHERE ${conditions.join('\n         AND ')}
       ORDER BY i.athlete_id, i.occurrence_date ASC NULLS LAST, i.created_at ASC, i.id ASC`,
      parameters,
    );
  const injuries = result.rows.map((row) => ({
    athleteId: row.athlete_id,
    bodyRegion: row.body_region,
    area: row.area,
    side: row.side,
    severity: row.severity,
    occurrenceDate: row.occurrence_date,
    expectedReturnDate: row.expected_return_date,
    resolvedDate: row.resolved_date,
    active: row.resolved_date === null,
  }));

  return {
    selectedRange: query.dateRange,
    lifecycleStatus: query.lifecycleStatus,
    limitations: [
      'Indicators summarize recorded injuries only; they are not medical diagnoses or probability estimates.',
      'No workload, readiness, attendance, treatment, or recovery data is available to these indicators.',
    ],
    athletes: summarizeCoachInjuries(athletes, injuries, now),
  };
}
