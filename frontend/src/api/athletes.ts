import type {
  Athlete,
  AthleteListFilters,
  AthleteMutationPayload,
  ApiList,
} from '../types';
import { get, create, update, request } from './client';

export async function listAthletes(
  filters: AthleteListFilters = {},
  signal?: AbortSignal,
): Promise<ApiList<Athlete>> {
  const query = new URLSearchParams();
  if (filters.includeArchived !== undefined) {
    query.set('includeArchived', String(filters.includeArchived));
  }
  if (filters.status) query.set('status', filters.status);
  if (filters.name?.trim()) query.set('name', filters.name.trim());
  if (filters.squadId) query.set('squadId', filters.squadId);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return request<ApiList<Athlete>>(`/api/v1/athletes${suffix}`, { signal });
}

export async function getAthlete(id: string): Promise<Athlete> {
  return get<Athlete>('athletes', id);
}

export async function createAthlete(payload: AthleteMutationPayload): Promise<Athlete> {
  return create<Athlete>('athletes', payload);
}

export async function updateAthlete(id: string, payload: AthleteMutationPayload): Promise<Athlete> {
  return update<Athlete>('athletes', id, payload);
}

export async function archiveAthlete(id: string): Promise<Athlete> {
  const response = await request<{ data: Athlete }>(`/api/v1/athletes/${id}`, {
    method: 'DELETE',
  });
  return response.data;
}

export async function unarchiveAthlete(id: string): Promise<Athlete> {
  const response = await request<{ data: Athlete }>(`/api/v1/athletes/${id}/unarchive`, {
    method: 'POST',
  });
  return response.data;
}

export async function updateAthleteStatus(id: string, status: Athlete['status']): Promise<Athlete> {
  const response = await request<{ data: Athlete }>(`/api/v1/athletes/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
  return response.data;
}
