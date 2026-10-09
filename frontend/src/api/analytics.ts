import { request } from './client';

export interface AnalyticsDiscipline {
  code: string;
  label: string;
  unit: 'seconds' | 'metres' | 'cm';
  precision: number;
  direction: 'lower' | 'higher';
}

export interface AnalyticsResult {
  id: string;
  source: 'legacy_result' | 'session_result';
  sourceResultId: string;
  athleteId: string;
  discipline: AnalyticsDiscipline;
  event: {
    id: string;
    title: string;
    date: string;
    time: string | null;
    type: 'competition' | 'training';
  };
  value: number;
  place: number | null;
}

export interface AthleteDisciplineAnalysis {
  athleteId: string;
  discipline: AnalyticsDiscipline;
  season: { selected: number | 'all'; startDate: string | null; endDate: string | null };
  pb: number | null;
  sb: number | null;
  latest: AnalyticsResult | null;
  first: AnalyticsResult | null;
  average: number | null;
  median: number | null;
  improvement: number | null;
  recentTrend: {
    direction: 'improving' | 'steady' | 'declining';
    previousAverage: number;
    recentAverage: number;
    change: number;
    samplesPerWindow: number;
  } | null;
  resultCount: number;
  recentResults: AnalyticsResult[];
  history: AnalyticsResult[];
}

export interface WorkspaceDisciplineAnalysis {
  discipline: AnalyticsDiscipline;
  season: { selected: number | 'all'; startDate: string | null; endDate: string | null };
  ranking: {
    basis: 'pb';
    direction: 'lower' | 'higher';
    ordering: string;
    tieHandling: string;
    unrankedHandling: string;
    factors: readonly ['pb', 'sb', 'latest', 'first', 'average', 'median', 'improvement', 'recentTrend', 'resultCount'];
  };
  athletes: Array<{
    athlete: { id: string; name: string; status: 'active' | 'inactive' | 'archived' };
    rank: number | null;
    factors: AthleteDisciplineAnalysis;
  }>;
}

export type CoachLifecycleStatus = 'active' | 'inactive' | 'all';
export type CoachAthleteLifecycleStatus = 'active' | 'inactive' | 'archived';
export type CoachInjuryRegion = 'Head & Neck' | 'Torso' | 'Arm' | 'Leg';
export type CoachInjuryArea =
  | 'Head'
  | 'Neck'
  | 'Chest'
  | 'Abdomen / core'
  | 'Pelvis'
  | 'Upper back'
  | 'Lower back'
  | 'Shoulder'
  | 'Upper arm'
  | 'Elbow'
  | 'Forearm'
  | 'Wrist'
  | 'Hand'
  | 'Hip'
  | 'Thigh'
  | 'Knee'
  | 'Shin / calf'
  | 'Ankle'
  | 'Foot';
export type CoachInjurySide = 'Left' | 'Right' | 'Both' | 'Center';
export type CoachInjurySeverity = 'Minor' | 'Moderate' | 'Severe';
export type CoachInjuryWarningLevel = 'low' | 'moderate' | 'high';
export type CoachInjuryWarningReason =
  | 'active_severe_injury'
  | 'multiple_active_injuries'
  | 'active_moderate_injury'
  | 'overdue_expected_return'
  | 'repeated_same_area'
  | 'clustered_injuries'
  | 'recent_recorded_injury'
  | 'active_minor_injury'
  | 'recorded_history_only'
  | 'no_recorded_injuries';
export type CoachRankingFactorName = 'standing' | 'improvementPercent' | 'consistency' | 'resultCount';

export interface CoachDateRange {
  dateFrom: string | null;
  dateTo: string | null;
}

export interface CoachPerformanceAnalysisFilters {
  athleteIds?: readonly string[];
  discipline?: string;
  dateFrom?: string;
  dateTo?: string;
  lifecycleStatus?: CoachLifecycleStatus;
  limit?: number;
}

export interface CoachInjuryAnalysisFilters {
  athleteIds?: readonly string[];
  dateFrom?: string;
  dateTo?: string;
  lifecycleStatus?: CoachLifecycleStatus;
}

export interface CoachRankingsAnalysisFilters {
  discipline: string;
  dateFrom?: string;
  dateTo?: string;
  lifecycleStatus?: CoachLifecycleStatus;
  limit?: number;
}

export interface CoachPerformanceResultPoint {
  date: string;
  time: string | null;
  value: number;
  event: {
    id: string;
    title: string;
    type: 'competition' | 'training';
  };
}

export interface CoachRecentTrend {
  direction: 'improving' | 'steady' | 'declining';
  previousAverage: number;
  recentAverage: number;
  change: number;
  samplesPerWindow: number;
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
    season: { selected: number | 'all'; startDate: string | null; endDate: string | null };
  };
  improvement: number | null;
  improvementPercent: number | null;
  recentTrend: CoachRecentTrend | null;
  consistency: CoachConsistency | null;
  plateau: CoachPlateau | null;
  sufficientData: boolean;
  insufficientDataReason: string | null;
  history: CoachPerformanceResultPoint[];
}

export interface CoachPerformanceChangeLeader {
  athlete: { id: string; name: string; status: CoachAthleteLifecycleStatus };
  discipline: AnalyticsDiscipline;
  first: CoachPerformanceResultPoint;
  latest: CoachPerformanceResultPoint;
  improvement: number;
  improvementPercent: number;
}

export interface CoachRelativeImprovementEntry extends CoachPerformanceChangeLeader {
  rank: number;
  recordCount: number;
  classification: 'improved' | 'unchanged' | 'declined';
}

export interface CoachPerformanceAnalysis {
  selectedRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
  athletes: Array<{
    athlete: { id: string; name: string; status: CoachAthleteLifecycleStatus };
    disciplines: CoachPerformanceDisciplineAnalysis[];
  }>;
  comparison: {
    methodology: 'Eligible athlete-discipline changes are ranked by direction-aware percentage change from the first to latest valid result in the selected range; times improve when lower, while distances and heights improve when higher. Raw values from different disciplines are not compared directly.';
    eligibleAthleteDisciplineCount: number;
    mostImproved: CoachPerformanceChangeLeader | null;
    mostDeclined: CoachPerformanceChangeLeader | null;
    insufficientDataReason: string | null;
    relativeImprovementRanking: {
      methodology: string;
      eligibility: string;
      limit: number;
      eligibleAthleteCount: number;
      entries: CoachRelativeImprovementEntry[];
      insufficientDataReason: string | null;
    };
  };
}

export interface CoachInjuryHistoryEntry {
  bodyRegion: CoachInjuryRegion;
  area: CoachInjuryArea;
  side: CoachInjurySide;
  severity: CoachInjurySeverity;
  occurrenceDate: string | null;
  expectedReturnDate: string | null;
  resolvedDate: string | null;
  active: boolean;
}

export interface CoachInjuryWarning {
  level: CoachInjuryWarningLevel;
  reasons: CoachInjuryWarningReason[];
}

export interface CoachInjuryAnalysis {
  selectedRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
  limitations: readonly [
    'Indicators summarize recorded injuries only; they are not medical diagnoses or probability estimates.',
    'No workload, readiness, attendance, treatment, or recovery data is available to these indicators.',
  ];
  athletes: Array<{
    athlete: { id: string; name: string; status: CoachAthleteLifecycleStatus };
    injuryCount: number;
    activeInjuryCount: number;
    mostCommonRecordedArea: { bodyRegion: CoachInjuryRegion; area: CoachInjuryArea; count: number } | null;
    repeatedInjuries: Array<{ bodyRegion: CoachInjuryRegion; area: CoachInjuryArea; side: CoachInjurySide; count: number }>;
    warning: CoachInjuryWarning;
    history: CoachInjuryHistoryEntry[];
  }>;
  rosterSummary: {
    injuryRecordCount: number;
    athletesWithRecordedInjuries: number;
    mostCommonRecordedArea: { bodyRegion: CoachInjuryRegion; area: CoachInjuryArea; count: number } | null;
    mostCommonBodyRegion: { bodyRegion: CoachInjuryRegion; count: number } | null;
    athletesWithRepeatedInjuries: Array<{
      athlete: { id: string; name: string; status: CoachAthleteLifecycleStatus };
      repeatedInjuries: Array<{ bodyRegion: CoachInjuryRegion; area: CoachInjuryArea; side: CoachInjurySide; count: number }>;
    }>;
    insufficientDataReason: string | null;
  };
}

export interface CoachRankingFactor<T> {
  value: T | null;
  score: number | null;
  includedInScore: boolean;
  insufficientDataReason: string | null;
}

export interface CoachRankingEntry {
  athlete: { id: string; name: string; status: CoachAthleteLifecycleStatus };
  rank: number | null;
  score: number | null;
  includedFactors: CoachRankingFactorName[];
  sufficientData: boolean;
  insufficientDataReason: string | null;
  factors: {
    standing: CoachRankingFactor<number> & {
      personalBest: number | null;
      current: number | null;
      standingRank: number | null;
    };
    improvementPercent: CoachRankingFactor<number>;
    consistency: CoachRankingFactor<CoachConsistency>;
    resultCount: CoachRankingFactor<number>;
  };
}

export interface CoachRankingsAnalysis {
  discipline: AnalyticsDiscipline;
  selectedRange: CoachDateRange;
  lifecycleStatus: CoachLifecycleStatus;
  limit: number;
  scoring: {
    direction: AnalyticsDiscipline['direction'];
    weights: Readonly<Record<CoachRankingFactorName, number>>;
    missingFactorHandling: 'Factors without enough athlete or comparison data are omitted from the weighted score.';
    ordering: 'Higher score ranks first; ties use discipline standing, athlete name, then athlete ID.';
  };
  athletes: CoachRankingEntry[];
}

function seasonQuery(year?: string): string {
  return year ? `?year=${encodeURIComponent(year)}` : '';
}

function coachAnalyticsQuery(filters: {
  athleteIds?: readonly string[];
  discipline?: string;
  dateFrom?: string;
  dateTo?: string;
  lifecycleStatus?: CoachLifecycleStatus;
  limit?: number;
}): string {
  const query = new URLSearchParams();
  if (filters.athleteIds?.length) query.set('athleteIds', filters.athleteIds.join(','));
  if (filters.discipline) query.set('discipline', filters.discipline);
  if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) query.set('dateTo', filters.dateTo);
  if (filters.lifecycleStatus) query.set('lifecycleStatus', filters.lifecycleStatus);
  if (filters.limit !== undefined) query.set('limit', String(filters.limit));
  const value = query.toString();
  return value ? `?${value}` : '';
}

export async function getAthleteDisciplineAnalysis(
  athleteId: string,
  discipline: string,
  year?: string,
): Promise<AthleteDisciplineAnalysis> {
  const response = await request<{ data: AthleteDisciplineAnalysis }>(
    `/api/v1/analytics/athletes/${encodeURIComponent(athleteId)}/disciplines/${encodeURIComponent(discipline)}${seasonQuery(year)}`,
  );
  return response.data;
}

export async function getWorkspaceDisciplineAnalysis(
  discipline: string,
  year?: string,
): Promise<WorkspaceDisciplineAnalysis> {
  const response = await request<{ data: WorkspaceDisciplineAnalysis }>(
    `/api/v1/analytics/disciplines/${encodeURIComponent(discipline)}/athletes${seasonQuery(year)}`,
  );
  return response.data;
}

export async function getCoachPerformanceAnalysis(
  filters: CoachPerformanceAnalysisFilters = {},
): Promise<CoachPerformanceAnalysis> {
  const response = await request<{ data: CoachPerformanceAnalysis }>(
    `/api/v1/analytics/coach/performance${coachAnalyticsQuery(filters)}`,
  );
  return response.data;
}

export async function getCoachInjuryAnalysis(
  filters: CoachInjuryAnalysisFilters = {},
): Promise<CoachInjuryAnalysis> {
  const response = await request<{ data: CoachInjuryAnalysis }>(
    `/api/v1/analytics/coach/injuries${coachAnalyticsQuery(filters)}`,
  );
  return response.data;
}

export async function getCoachRankingsAnalysis(
  filters: CoachRankingsAnalysisFilters,
): Promise<CoachRankingsAnalysis> {
  const response = await request<{ data: CoachRankingsAnalysis }>(
    `/api/v1/analytics/coach/rankings${coachAnalyticsQuery(filters)}`,
  );
  return response.data;
}
