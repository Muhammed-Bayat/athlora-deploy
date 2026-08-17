import type { AthleteStatisticsDetail } from '../types';
import { get } from './client';

export async function getAthleteStatistics(
  athleteId: string,
): Promise<AthleteStatisticsDetail> {
  return get<AthleteStatisticsDetail>('athletes', `${athleteId}/statistics`);
}
