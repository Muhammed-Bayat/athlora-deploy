import { request } from './client';
import type { ApiList, EventStatus } from '../types';
import type { DisciplineDefinition, DisciplineSession, EntrantCreateInput, EntrantUpdateInput, MeetEntrant, SessionEntry, SessionEntryInput, SessionOverrideInput, SessionRegistration, SessionResult, SessionSelectionInput, SessionStatistics, SessionTarget, SessionResolution } from '../types/meets';

const eventPath = (eventId: string) => `/api/v1/events/${encodeURIComponent(eventId)}`;
const sessionPath = (eventId: string, sessionId: string) => `${eventPath(eventId)}/sessions/${encodeURIComponent(sessionId)}`;
const targetPath = (eventId: string, target: SessionTarget) => `${sessionPath(eventId, target.disciplineSessionId)}/entrants/${encodeURIComponent(target.entrantId)}`;
async function mutate<T>(path: string, method: string, body: unknown): Promise<T> {
  return (await request<{ data: T }>(path, { method, body: JSON.stringify(body) })).data;
}
export const listDisciplines = () => request<ApiList<DisciplineDefinition>>('/api/v1/disciplines');
export const listSessions = (eventId: string) => request<ApiList<DisciplineSession>>(`${eventPath(eventId)}/sessions`);
export const createSession = (eventId: string, body: { disciplineDefinitionId: string; label: string; verticalConfig?: import('../types/meets').VerticalConfig }) => mutate<DisciplineSession>(`${eventPath(eventId)}/sessions`, 'POST', body);
export const changeSessionState = (eventId: string, sessionId: string, status: EventStatus, expectedVersion: number) => mutate<DisciplineSession>(sessionPath(eventId, sessionId), 'PATCH', { status, expectedVersion });
export const listEntrants = (eventId: string) => request<ApiList<MeetEntrant>>(`${eventPath(eventId)}/entrants`);
export const createEntrant = (eventId: string, body: EntrantCreateInput) => mutate<MeetEntrant>(`${eventPath(eventId)}/entrants`, 'POST', body);
export const updateEntrant = (eventId: string, entrantId: string, body: EntrantUpdateInput) => mutate<MeetEntrant>(`${eventPath(eventId)}/entrants/${encodeURIComponent(entrantId)}`, 'PATCH', body);
export const listRegistrations = (eventId: string, sessionId: string) => request<ApiList<SessionRegistration>>(`${sessionPath(eventId, sessionId)}/entrants`);
export const registerEntrant = (eventId: string, target: SessionTarget) => mutate<SessionRegistration>(targetPath(eventId, target), 'POST', {});
export const withdrawEntrant = (eventId: string, target: SessionTarget) => request<void>(targetPath(eventId, target), { method: 'DELETE' });
export const listSessionEntries = (eventId: string, sessionId: string, entrantId?: string) => request<ApiList<SessionEntry>>(`${sessionPath(eventId, sessionId)}/entries${entrantId ? `?entrantId=${encodeURIComponent(entrantId)}` : ''}`);
export const createSessionEntry = (eventId: string, target: SessionTarget, body: SessionEntryInput) => mutate<SessionEntry>(`${targetPath(eventId, target)}/entries`, 'POST', body);
export const replaceSessionEntry = (eventId: string, target: SessionTarget, entryId: string, body: SessionEntryInput & { expectedVersion: number }) => mutate<SessionEntry>(`${targetPath(eventId, target)}/entries/${encodeURIComponent(entryId)}`, 'PUT', body);
export const undoSessionEntry = (eventId: string, target: SessionTarget, entryId: string, expectedVersion: number) => request<void>(`${targetPath(eventId, target)}/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) });
export const listSessionResults = (eventId: string, sessionId: string) => request<ApiList<SessionResult>>(`${sessionPath(eventId, sessionId)}/results`);
export const getSessionResolution = (eventId: string, sessionId: string) => mutate<SessionResolution>(`${sessionPath(eventId, sessionId)}/resolution`, 'GET', undefined);
export const resolveSessionConflict = (eventId: string, sessionId: string, conflictId: string, reason: string) => mutate(`${sessionPath(eventId, sessionId)}/conflicts/${encodeURIComponent(conflictId)}/resolve`, 'POST', { reason });
export const overrideSessionResult = (eventId: string, target: SessionTarget, body: SessionOverrideInput) => mutate<SessionResult>(`${sessionPath(eventId, target.disciplineSessionId)}/results/${encodeURIComponent(target.entrantId)}`, 'PUT', body);
export const selectSessionResultEntry = (eventId: string, target: SessionTarget, body: SessionSelectionInput) => mutate<SessionResult>(`${sessionPath(eventId, target.disciplineSessionId)}/results/${encodeURIComponent(target.entrantId)}/selection`, 'PUT', body);
export const sessionStatistics = async (eventId: string, sessionId: string, entrantId?: string) => (await request<{ data: SessionStatistics }>(`${sessionPath(eventId, sessionId)}/statistics${entrantId ? `?entrantId=${encodeURIComponent(entrantId)}` : ''}`)).data;
