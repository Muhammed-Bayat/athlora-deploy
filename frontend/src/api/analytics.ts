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

function seasonQuery(year?: string): string {
  return year ? `?year=${encodeURIComponent(year)}` : '';
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
