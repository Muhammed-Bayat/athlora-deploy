import { request } from './client';
import type { Club, ClubJoinRequest } from '../types';

export async function listClubs(search = ''): Promise<{ data: Club[]; meta: { count: number } }> {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
  return request(`/api/v1/clubs${query}`);
}

export async function createClub(name: string): Promise<Club> {
  const response = await request<{ data: Club }>('/api/v1/clubs', {
    method: 'POST', body: JSON.stringify({ name }),
  });
  return response.data;
}

export async function requestToJoinClub(clubId: string): Promise<ClubJoinRequest> {
  const response = await request<{ data: ClubJoinRequest }>(`/api/v1/clubs/${clubId}/join-requests`, {
    method: 'POST',
  });
  return response.data;
}

export async function listMyClubJoinRequests(): Promise<{ data: ClubJoinRequest[]; meta: { count: number } }> {
  return request('/api/v1/clubs/join-requests/me');
}

export async function withdrawClubJoinRequest(requestId: string): Promise<void> {
  await request<void>(`/api/v1/clubs/join-requests/${requestId}/withdraw`, { method: 'POST' });
}

export async function listClubJoinRequests(clubId: string): Promise<{ data: ClubJoinRequest[]; meta: { count: number } }> {
  return request(`/api/v1/clubs/${clubId}/join-requests`);
}

export async function approveClubJoinRequest(clubId: string, requestId: string, role: 'coach' | 'assistant'): Promise<ClubJoinRequest> {
  const response = await request<{ data: ClubJoinRequest }>(`/api/v1/clubs/${clubId}/join-requests/${requestId}/approve`, {
    method: 'POST', body: JSON.stringify({ role }),
  });
  return response.data;
}

export async function rejectClubJoinRequest(clubId: string, requestId: string): Promise<ClubJoinRequest> {
  const response = await request<{ data: ClubJoinRequest }>(`/api/v1/clubs/${clubId}/join-requests/${requestId}/reject`, {
    method: 'POST',
  });
  return response.data;
}
