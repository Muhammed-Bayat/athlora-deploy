import { requestPublic } from './client';
import type { PublicClub, PublicClubSchedule } from '../types';

export async function listPublicScheduleClubs(
  search = '',
  signal?: AbortSignal,
): Promise<{ data: PublicClub[]; meta: { count: number } }> {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  return requestPublic(`/api/v1/public/schedule/clubs${query}`, { signal });
}

export async function getPublicClubSchedule(clubId: string, signal?: AbortSignal): Promise<PublicClubSchedule> {
  const response = await requestPublic<{ data: PublicClubSchedule }>(
    `/api/v1/public/schedule/clubs/${encodeURIComponent(clubId)}`,
    { signal },
  );
  return response.data;
}
