import { requestPublic } from './client';
import type { PublicAthleteComparison, PublicClub, PublicClubStatistics } from '../types';

export interface PublicSafeRelayMember { leg: number; name: string; isGuest: boolean }
export interface PublicSessionResultRow {
  entrantId: string;
  name: string;
  kind: 'athlete' | 'guest' | 'relay';
  members: PublicSafeRelayMember[];
  value: number | null;
  outcome: string;
  placing: number | null;
  isSelected: boolean;
}
export interface PublicClubSessionResults {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  sessions: Array<{
    id: string;
    label: string;
    status: string;
    resultState?: string;
    disciplineCode: string;
    disciplineLabel: string;
    unit: string;
    precision: number;
    results: PublicSessionResultRow[];
  }>;
}

export async function listPublicClubs(search = ''): Promise<{ data: PublicClub[]; meta: { count: number } }> {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  return requestPublic(`/api/v1/public/statistics/clubs${query}`);
}

export async function listPublicSeasons(): Promise<number[]> {
  const response = await requestPublic<{ data: number[] }>('/api/v1/public/statistics/seasons');
  return response.data;
}

export async function getPublicClubStatistics(clubId: string, signal?: AbortSignal, year?: string): Promise<PublicClubStatistics> {
  const response = await requestPublic<{ data: PublicClubStatistics }>(`/api/v1/public/statistics/clubs/${clubId}${year ? `?year=${encodeURIComponent(year)}` : ''}`, { signal });
  return response.data;
}

export async function getPublicAthleteComparison(athleteIds: string[], signal?: AbortSignal, year?: string): Promise<PublicAthleteComparison> {
  const query = new URLSearchParams();
  athleteIds.forEach((athleteId) => query.append('athleteId', athleteId));
  if (year) query.set('year', year);
  const response = await requestPublic<{ data: PublicAthleteComparison }>(`/api/v1/public/statistics/comparison?${query}`, { signal });
  return response.data;
}

export interface LeaderboardEntry {
  athleteId: string;
  athleteName: string;
  clubId: string;
  clubName: string;
  discipline: string;
  label: string;
  unit: 'seconds' | 'metres' | 'cm';
  precision: number;
  direction: 'lower' | 'higher';
  performance: number;
  place: number;
  season: string | null;
  gender: string | null;
  age: number | null;
}

export interface PublicStatisticsReportEntry {
  athleteId: string;
  athleteName: string;
  clubId: string;
  clubName: string;
  discipline: string;
  label: string;
  unit: 'seconds' | 'metres' | 'cm';
  precision: number;
  direction: 'lower' | 'higher';
  performance: number;
  place: number;
  eventTitle: string;
  eventDate: string;
}

export interface PublicStatisticsReport {
  data: PublicStatisticsReportEntry[];
  meta: { count: number; generatedAt: string };
}

export async function getPublicLeaderboard(filters: Record<string, string | undefined>, signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await requestPublic<{ data: LeaderboardEntry[] }>(`/api/v1/public/statistics/leaderboard${query}`, { signal });
  return response.data;
}

export async function getPublicStatisticsReport(filters: Record<string, string | undefined>, signal?: AbortSignal): Promise<PublicStatisticsReport> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  return requestPublic<PublicStatisticsReport>(`/api/v1/public/statistics/report${query}`, { signal });
}

export async function getPublicClubSessionResults(clubId: string, signal?: AbortSignal): Promise<PublicClubSessionResults[]> {
  const response = await requestPublic<{ data: PublicClubSessionResults[] }>(`/api/v1/public/statistics/clubs/${encodeURIComponent(clubId)}/session-results`, { signal });
  return response.data;
}
