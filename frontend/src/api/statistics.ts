import type { AthleteStatisticsDetail, ProgressionDetail } from '../types';
import { get } from './client';

export async function getAthleteStatistics(
  athleteId: string,
): Promise<AthleteStatisticsDetail> {
  return get<AthleteStatisticsDetail>('athletes', `${athleteId}/statistics`);
}

export async function getAthleteProgression(
  athleteId: string,
  options?: { cursor?: string; limit?: number; type?: string },
): Promise<ProgressionDetail> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.type) params.set('type', options.type);
  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return get<ProgressionDetail>('athletes', `${athleteId}/progression${suffix}`);
}
