import type { ApiList, Squad } from '../types';
import { create, request, update } from './client';

export async function listSquads(includeArchived = false): Promise<ApiList<Squad>> {
  return request<ApiList<Squad>>(`/api/v1/squads${includeArchived ? '?includeArchived=true' : ''}`);
}
export function createSquad(name: string): Promise<Squad> { return create<Squad>('squads', { name }); }
export function updateSquad(id: string, name: string): Promise<Squad> { return update<Squad>('squads', id, { name }); }
export async function archiveSquad(id: string): Promise<Squad> { return (await request<{ data: Squad }>(`/api/v1/squads/${id}`, { method: 'DELETE' })).data; }
export async function unarchiveSquad(id: string): Promise<Squad> { return (await request<{ data: Squad }>(`/api/v1/squads/${id}/unarchive`, { method: 'POST' })).data; }
