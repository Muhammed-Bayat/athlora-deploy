import type { EventParticipant, ApiList } from '../types';
import { list, create, remove } from './client';

export async function listEventParticipants(eventId: string): Promise<ApiList<EventParticipant>> {
  return list<EventParticipant>(`events/${eventId}/participants`);
}

export async function addEventParticipant(eventId: string, payload: unknown): Promise<EventParticipant> {
  return create<EventParticipant>(`events/${eventId}/participants`, payload);
}

export async function removeEventParticipant(eventId: string, athleteId: string): Promise<void> {
  return remove(`events/${eventId}/participants`, athleteId);
}
