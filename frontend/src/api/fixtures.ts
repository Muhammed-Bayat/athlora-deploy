import { create, list, request, remove, update } from './client';
import type {
  ApiList,
  EventParticipantSummary,
  FixtureDetail,
  FixtureInvitation,
  FixtureInvitationStatus,
  FixtureTeamRoster,
  Result,
  ResultOverridePayload,
  RsvpStatus,
  TimelineEntry,
  TimelineEntryCreatePayload,
  TimelineEntryDeletePayload,
  TimelineEntryPatchPayload,
} from '../types';

export async function createFixtureInvitation(eventId: string, payload: { email: string; expiresInDays?: number }): Promise<FixtureInvitation> {
  return create<FixtureInvitation>(`events/${eventId}/fixture-invitations`, payload);
}

export async function listFixtureInvitations(eventId: string): Promise<ApiList<FixtureInvitation>> {
  return list<FixtureInvitation>(`events/${eventId}/fixture-invitations`);
}

export async function resendFixtureInvitation(eventId: string, invitationId: string): Promise<FixtureInvitation> {
  const response = await request<{ data: FixtureInvitation }>(`/api/v1/events/${eventId}/fixture-invitations/${invitationId}/resend`, { method: 'POST' });
  return response.data;
}

export async function revokeFixtureInvitation(eventId: string, invitationId: string): Promise<void> {
  await request<void>(`/api/v1/events/${eventId}/fixture-invitations/${invitationId}`, { method: 'DELETE' });
}

export async function listFixtureRosters(eventId: string): Promise<ApiList<FixtureTeamRoster>> {
  return list<FixtureTeamRoster>(`events/${eventId}/fixture-rosters`);
}

export async function recordFixtureWithdrawal(eventId: string, workspaceId: string): Promise<void> {
  await request<void>(`/api/v1/events/${eventId}/fixture-workspaces/${workspaceId}/withdrawal`, { method: 'POST' });
}

export async function respondToFixtureInvitation(token: string, response: Exclude<FixtureInvitationStatus, 'pending' | 'revoked'>, message?: string): Promise<FixtureInvitation> {
  const result = await request<{ data: FixtureInvitation }>(`/api/v1/fixtures/invitations/${token}/respond`, {
    method: 'POST', body: JSON.stringify({ response, ...(message ? { message } : {}) }),
  });
  return result.data;
}

export async function listGuestFixtures(): Promise<ApiList<FixtureDetail>> {
  return list<FixtureDetail>('fixtures');
}

export async function getGuestFixture(eventId: string): Promise<FixtureDetail> {
  const result = await request<{ data: FixtureDetail }>(`/api/v1/fixtures/${eventId}`);
  return result.data;
}

export async function listGuestFixtureParticipants(eventId: string): Promise<ApiList<EventParticipantSummary>> {
  return list<EventParticipantSummary>(`fixtures/${eventId}/participants`);
}

export async function addGuestFixtureParticipant(eventId: string, athleteId: string): Promise<EventParticipantSummary> {
  return create<EventParticipantSummary>(`fixtures/${eventId}/participants`, { athleteId });
}

export async function updateGuestFixtureParticipant(eventId: string, athleteId: string, rsvpStatus: RsvpStatus): Promise<EventParticipantSummary> {
  return update<EventParticipantSummary>(`fixtures/${eventId}/participants`, athleteId, { rsvpStatus });
}

export async function removeGuestFixtureParticipant(eventId: string, athleteId: string): Promise<void> {
  return remove(`fixtures/${eventId}/participants`, athleteId);
}

export async function withdrawGuestFixture(eventId: string): Promise<void> {
  await request<void>(`/api/v1/fixtures/${eventId}/withdrawal`, { method: 'POST' });
}

export async function listGuestFixtureEntries(eventId: string): Promise<ApiList<TimelineEntry>> {
  return list<TimelineEntry>(`fixtures/${eventId}/entries`);
}

export async function createGuestFixtureEntry(eventId: string, payload: TimelineEntryCreatePayload): Promise<TimelineEntry> {
  return create<TimelineEntry>(`fixtures/${eventId}/entries`, payload);
}

export async function updateGuestFixtureEntry(eventId: string, entryId: string, payload: TimelineEntryPatchPayload): Promise<TimelineEntry> {
  const response = await request<{ data: TimelineEntry }>(`/api/v1/fixtures/${eventId}/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  return response.data;
}

export async function deleteGuestFixtureEntry(eventId: string, entryId: string, payload: TimelineEntryDeletePayload): Promise<void> {
  await request<void>(`/api/v1/fixtures/${eventId}/entries/${entryId}`, { method: 'DELETE', body: JSON.stringify(payload) });
}

export async function listHostedFixtureEntries(eventId: string): Promise<ApiList<TimelineEntry>> {
  return list<TimelineEntry>(`events/${eventId}/fixture-entries`);
}

export async function listHostedFixtureResults(eventId: string): Promise<ApiList<Result>> {
  return list<Result>(`events/${eventId}/fixture-results`);
}

export async function overrideHostFixtureResult(eventId: string, athleteId: string, payload: ResultOverridePayload): Promise<Result> {
  const response = await request<{ data: Result }>(`/api/v1/events/${eventId}/fixture-results/${athleteId}`, { method: 'PUT', body: JSON.stringify(payload) });
  return response.data;
}

export async function listGuestFixtureResults(eventId: string): Promise<ApiList<Result>> {
  return list<Result>(`fixtures/${eventId}/results`);
}

export async function overrideGuestFixtureResult(eventId: string, athleteId: string, payload: ResultOverridePayload): Promise<Result> {
  const response = await request<{ data: Result }>(`/api/v1/fixtures/${eventId}/results/${athleteId}`, { method: 'PUT', body: JSON.stringify(payload) });
  return response.data;
}
