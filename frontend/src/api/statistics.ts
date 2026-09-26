import type { AthleteStatisticsDetail, ProgressionDetail } from '../types';
import type { DisciplineDefinition } from '../types/meets';
import { get } from './client';

export interface AthleteDisciplineStatistics {
  athleteId: string;
  athleteName: string;
  discipline: string;
  label: string;
  unit: DisciplineDefinition['unit'];
  direction: DisciplineDefinition['direction'];
  precision: number;
  pb: number;
  sb: number | null;
  resultCount: number;
  seasonCount: number;
  seasonAverage: number | null;
  seasonTotal: number | null;
  placing: number | null;
}

export interface DisciplineProgressionDetail {
  entries: Array<{ eventId: string; eventDate: string; eventTitle: string; value: number; isNewPb: boolean }>;
  summary: { personalBest: number | null; resultCount: number };
}

export async function getAthleteStatistics(
  athleteId: string,
  year?: string,
): Promise<AthleteStatisticsDetail> {
  return get<AthleteStatisticsDetail>('athletes', `${athleteId}/statistics${year ? `?year=${encodeURIComponent(year)}` : ''}`);
}

export async function getAthleteDisciplineStatistics(
  athleteId: string,
  year: string,
): Promise<AthleteDisciplineStatistics[]> {
  return get<AthleteDisciplineStatistics[]>('athletes', `${athleteId}/statistics/disciplines?year=${encodeURIComponent(year)}`);
}

export async function getAthleteDisciplineProgression(
  athleteId: string,
  disciplineDefinitionId: string,
  year: string,
): Promise<DisciplineProgressionDetail> {
  return get<DisciplineProgressionDetail>('athletes', `${athleteId}/statistics/disciplines/${encodeURIComponent(disciplineDefinitionId)}/progression?year=${encodeURIComponent(year)}`);
}

export async function getAthleteProgression(
  athleteId: string,
  options?: { cursor?: string; limit?: number; type?: string; year?: string },
): Promise<ProgressionDetail> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.type) params.set('type', options.type);
  if (options?.year) params.set('year', options.year);
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return get<ProgressionDetail>('athletes', `${athleteId}/progression${suffix}`);
}
