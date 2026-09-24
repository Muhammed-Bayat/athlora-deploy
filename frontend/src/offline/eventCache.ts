import { getOfflineDB } from './db';

export interface CachedEventData {
  event: Record<string, unknown> | null;
  participants: Record<string, unknown> | null;
  timeline: Record<string, unknown>[] | null;
  cachedAt: number | null;
}

export async function cacheEventData(
  eventId: string,
  workspaceId: string,
  event: Record<string, unknown>,
  participants: Record<string, unknown>,
  timeline: Record<string, unknown>[],
  userId: string,
): Promise<void> {
  const db = getOfflineDB(userId);
  const now = Date.now();

  await Promise.all([
    db.cachedEvents.put({ id: eventId, workspaceId, data: event, cachedAt: now }),
    db.cachedParticipants.put({ eventId, data: participants, cachedAt: now }),
    db.cachedTimeline.put({ eventId, entries: timeline, cachedAt: now }),
  ]);
}

export async function getCachedEventData(
  eventId: string,
  userId: string,
): Promise<CachedEventData> {
  const db = getOfflineDB(userId);
  const [event, participants, timeline] = await Promise.all([
    db.cachedEvents.get(eventId),
    db.cachedParticipants.get(eventId),
    db.cachedTimeline.get(eventId),
  ]);

  const timestamps = [event?.cachedAt, participants?.cachedAt, timeline?.cachedAt]
    .filter((value): value is number => value !== undefined);
  return {
    event: event?.data ?? null,
    participants: participants?.data ?? null,
    timeline: timeline?.entries ?? null,
    cachedAt: timestamps.length > 0 ? Math.min(...timestamps) : null,
  };
}

export async function clearEventCache(userId: string): Promise<void> {
  const db = getOfflineDB(userId);
  await Promise.all([
    db.cachedEvents.clear(),
    db.cachedParticipants.clear(),
    db.cachedTimeline.clear(),
  ]);
}
