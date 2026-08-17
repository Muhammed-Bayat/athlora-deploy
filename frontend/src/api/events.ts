import type {
  AthleticsEvent,
  ApiList,
  EventListFilters,
  EventMutationPayload,
} from '../types';
import { get, create, update, request } from './client';

export async function listEvents(
  filters: EventListFilters = {},
  signal?: AbortSignal,
): Promise<ApiList<AthleticsEvent>> {
  const query = new URLSearchParams();
  if (filters.type) query.set('type', filters.type);
  if (filters.status) query.set('status', filters.status);
  if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) query.set('dateTo', filters.dateTo);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return request<ApiList<AthleticsEvent>>(`/api/v1/events${suffix}`, { signal });
}

export async function getEvent(id: string): Promise<AthleticsEvent> {
  return get<AthleticsEvent>('events', id);
}

export async function createEvent(payload: EventMutationPayload): Promise<AthleticsEvent> {
  return create<AthleticsEvent>('events', payload);
}

export async function updateEvent(id: string, payload: EventMutationPayload): Promise<AthleticsEvent> {
  return update<AthleticsEvent>('events', id, payload);
}

export async function cancelEvent(id: string): Promise<AthleticsEvent> {
  const response = await request<{ data: AthleticsEvent }>(`/api/v1/events/${id}`, {
    method: 'DELETE',
  });
  return response.data;
}

export async function getEventWeather(id: string): Promise<unknown> {
  return request<unknown>(`/api/v1/events/${id}/weather`);
}
