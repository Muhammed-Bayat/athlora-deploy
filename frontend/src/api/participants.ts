import type { EventParticipantSummary, ApiList, RsvpStatus } from '../types';
import { list, create, update, remove } from './client';

export async function listEventParticipants(
  eventId: string,
): Promise<ApiList<EventParticipantSummary>> {
  return list<EventParticipantSummary>(`events/${eventId}/participants`);
}

export async function addEventParticipant(
  eventId: string,
  athleteId: string,
): Promise<EventParticipantSummary> {
  return create<EventParticipantSummary>(`events/${eventId}/participants`, { athleteId });
}

export async function updateEventParticipant(
  eventId: string,
  athleteId: string,
  rsvpStatus: RsvpStatus,
): Promise<EventParticipantSummary> {
  return update<EventParticipantSummary>(`events/${eventId}/participants`, athleteId, {
    rsvpStatus,
  });
}

export async function removeEventParticipant(eventId: string, athleteId: string): Promise<void> {
  return remove(`events/${eventId}/participants`, athleteId);
}
