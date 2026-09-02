import type { ComparisonDetail } from '../types';
import { request } from './client';

export async function getTwoAthleteComparison(
  athlete1Id: string,
  athlete2Id: string,
): Promise<ComparisonDetail> {
  const params = new URLSearchParams({ athlete1Id, athlete2Id });
  const response = await request<{ data: ComparisonDetail }>(`/api/v1/athletes/comparison?${params.toString()}`);
  return response.data;
}
