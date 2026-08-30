import type { ApiList, Injury } from '../types';
import { request } from './client';

export async function listInjuries(athleteId: string, signal?: AbortSignal): Promise<Injury[]> {
  const response = await request<ApiList<Injury>>(`/api/v1/athletes/${athleteId}/injuries`, { signal });
  return response.data;
}

export async function createInjury(
  athleteId: string,
  payload: {
    bodyRegion: string;
    area: string;
    side: string;
    severity: string;
    notes?: string | null;
    occurrenceDate: string;
    expectedReturnDate?: string | null;
  },
): Promise<Injury> {
  const response = await request<{ data: Injury }>(`/api/v1/athletes/${athleteId}/injuries`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function resolveInjury(
  athleteId: string,
  injuryId: string,
  payload: { resolvedDate?: string | null; resolutionNotes?: string | null } = {},
): Promise<Injury> {
  const response = await request<{ data: Injury }>(`/api/v1/athletes/${athleteId}/injuries/${injuryId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function reopenInjury(athleteId: string, injuryId: string): Promise<Injury> {
  const response = await request<{ data: Injury }>(`/api/v1/athletes/${athleteId}/injuries/${injuryId}/reopen`, {
    method: 'POST',
  });
  return response.data;
}

export async function deleteInjury(athleteId: string, injuryId: string): Promise<Injury> {
  const response = await request<{ data: Injury }>(`/api/v1/athletes/${athleteId}/injuries/${injuryId}`, {
    method: 'DELETE',
  });
  return response.data;
}
