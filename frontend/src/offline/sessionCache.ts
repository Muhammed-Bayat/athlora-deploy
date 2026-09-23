import { getOfflineDB } from './db';
import { getPublicOfflineDB } from './publicDb';

const cacheKey = (...ids: string[]) => ids.join(':');
export async function cacheSession(userId: string, workspaceId: string, eventId: string, disciplineSessionId: string, data: Record<string, unknown>): Promise<void> {
  await getOfflineDB(userId).cachedSessions.put({ key: cacheKey(workspaceId, eventId, disciplineSessionId), workspaceId, eventId, disciplineSessionId, data, cachedAt: Date.now() });
}
export async function getCachedSession(userId: string, workspaceId: string, eventId: string, disciplineSessionId: string) {
  return getOfflineDB(userId).cachedSessions.get(cacheKey(workspaceId, eventId, disciplineSessionId));
}
export async function cachePublicSession(token: string, eventId: string, disciplineSessionId: string, snapshot: Record<string, unknown>): Promise<void> {
  await getPublicOfflineDB(token).publicCachedSessions.put({ key: cacheKey(eventId, disciplineSessionId), eventId, disciplineSessionId, snapshot, cachedAt: Date.now() });
}
export async function getCachedPublicSession(token: string, eventId: string, disciplineSessionId: string) {
  return getPublicOfflineDB(token).publicCachedSessions.get(cacheKey(eventId, disciplineSessionId));
}
