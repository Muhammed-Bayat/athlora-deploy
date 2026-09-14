import Dexie, { type EntityTable } from 'dexie';

export interface PublicOfflineAction {
  id: string;
  actionType: 'create_entry' | 'edit_entry' | 'undo_entry';
  eventId: string;
  entryId?: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  status: 'pending' | 'synced' | 'failed';
  deviceId: string;
  createdAt: number;
  syncedAt?: number;
  serverReceipt?: Record<string, unknown>;
  error?: string;
}

export interface PublicCachedSnapshot {
  eventId: string;
  snapshot: Record<string, unknown>;
  cachedAt: number;
}

export type PublicOfflineDB = Dexie & {
  publicOfflineActions: EntityTable<PublicOfflineAction, 'id'>;
  publicCachedSnapshots: EntityTable<PublicCachedSnapshot, 'eventId'>;
};

const dbInstances = new Map<string, PublicOfflineDB>();

function getSessionHash(sessionToken: string): string {
  let hash = 0;
  for (let i = 0; i < sessionToken.length; i++) {
    hash = (hash * 31 + sessionToken.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function getPublicOfflineDB(sessionToken: string): PublicOfflineDB {
  const key = getSessionHash(sessionToken);
  if (dbInstances.has(key)) return dbInstances.get(key)!;

  const db = new Dexie(`athlora-public-${key}`) as PublicOfflineDB;
  db.version(1).stores({
    publicOfflineActions: 'id, [status+eventId+createdAt], eventId, status',
    publicCachedSnapshots: 'eventId',
  });

  dbInstances.set(key, db);
  return db;
}

export function resetPublicOfflineDB(sessionToken: string): void {
  const key = getSessionHash(sessionToken);
  dbInstances.delete(key);
}
