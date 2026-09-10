import { requestPublic } from './client';
import type { PublicClub, PublicClubStatistics } from '../types';

export async function listPublicClubs(search = ''): Promise<{ data: PublicClub[]; meta: { count: number } }> {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  return requestPublic(`/api/v1/public/statistics/clubs${query}`);
}

export async function getPublicClubStatistics(clubId: string, signal?: AbortSignal): Promise<PublicClubStatistics> {
  const response = await requestPublic<{ data: PublicClubStatistics }>(`/api/v1/public/statistics/clubs/${clubId}`, { signal });
  return response.data;
}
