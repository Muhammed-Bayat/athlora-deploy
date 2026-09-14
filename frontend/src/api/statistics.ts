import type { AthleteStatisticsDetail, ProgressionDetail } from '../types';
import { get } from './client';

export async function getAthleteStatistics(
  athleteId: string,
  year?: string,
): Promise<AthleteStatisticsDetail> {
  return get<AthleteStatisticsDetail>('athletes', `${athleteId}/statistics${year ? `?year=${encodeURIComponent(year)}` : ''}`);
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
