import { getPublicOfflineDB } from './publicDb';

export async function cachePublicSnapshot(
  eventId: string,
  snapshot: Record<string, unknown>,
  sessionToken: string,
): Promise<void> {
  const db = getPublicOfflineDB(sessionToken);
  await db.publicCachedSnapshots.put({ eventId, snapshot, cachedAt: Date.now() });
}

export async function getCachedPublicSnapshot(
  eventId: string,
  sessionToken: string,
): Promise<Record<string, unknown> | null> {
  const db = getPublicOfflineDB(sessionToken);
  const cached = await db.publicCachedSnapshots.get(eventId);
  return cached?.snapshot ?? null;
}

export async function clearPublicSnapshotCache(sessionToken: string): Promise<void> {
  const db = getPublicOfflineDB(sessionToken);
  await db.publicCachedSnapshots.clear();
}
