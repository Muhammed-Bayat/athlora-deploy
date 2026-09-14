import type { ComparisonDetail, MultiComparisonDetail } from '../types';
import { request } from './client';

export async function getTwoAthleteComparison(
  athlete1Id: string,
  athlete2Id: string,
  scope?: 'cross-club',
  year?: string,
): Promise<ComparisonDetail> {
  const params = new URLSearchParams({ athlete1Id, athlete2Id });
  if (scope) params.set('scope', scope);
  if (year) params.set('year', year);
  const response = await request<{ data: ComparisonDetail }>(`/api/v1/athletes/comparison?${params.toString()}`);
  return response.data;
}

export async function getMultiAthleteComparison(
  athleteIds: string[],
  scope?: 'cross-club',
  year?: string,
): Promise<MultiComparisonDetail> {
  const params = new URLSearchParams();
  athleteIds.forEach((athleteId) => params.append('athleteId', athleteId));
  if (scope) params.set('scope', scope);
  if (year) params.set('year', year);
  const response = await request<{ data: MultiComparisonDetail }>(`/api/v1/athletes/comparison/multi?${params.toString()}`);
  return response.data;
}
