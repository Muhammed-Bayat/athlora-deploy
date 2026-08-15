import type { AthleticsEvent, ApiList } from '../types';
import { list, get, create, update, remove, request } from './client';

export async function listEvents(): Promise<ApiList<AthleticsEvent>> {
  return list<AthleticsEvent>('events');
}

export async function getEvent(id: string): Promise<AthleticsEvent> {
  return get<AthleticsEvent>('events', id);
}

export async function createEvent(payload: unknown): Promise<AthleticsEvent> {
  return create<AthleticsEvent>('events', payload);
}

export async function updateEvent(id: string, payload: unknown): Promise<AthleticsEvent> {
  return update<AthleticsEvent>('events', id, payload);
}

export async function deleteEvent(id: string): Promise<void> {
  return remove('events', id);
}

export async function getEventWeather(id: string): Promise<unknown> {
  return request<unknown>(`/api/v1/events/${id}/weather`);
}
