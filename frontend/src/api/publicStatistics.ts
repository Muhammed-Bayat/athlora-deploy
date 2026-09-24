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

export async function getPublicClubSessionResults(clubId: string, signal?: AbortSignal): Promise<PublicClubSessionResults[]> {
  const response = await requestPublic<{ data: PublicClubSessionResults[] }>(`/api/v1/public/statistics/clubs/${encodeURIComponent(clubId)}/session-results`, { signal });
  return response.data;
}
