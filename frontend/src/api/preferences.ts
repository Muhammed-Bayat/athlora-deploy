import type { UserPreferences } from '../types';
import { request } from './client';

export async function getDashboardPreferences(): Promise<UserPreferences> {
  const response = await request<{ data: UserPreferences }>('/api/v1/preferences');
  return response.data;
}

export async function putDashboardPreferences(payload: UserPreferences): Promise<UserPreferences> {
  const response = await request<{ data: UserPreferences }>('/api/v1/preferences', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.data;
}
