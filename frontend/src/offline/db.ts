import Dexie, { type EntityTable } from 'dexie';

export interface OfflineAction {
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

export interface CachedEvent {
  id: string;
  workspaceId: string;
  data: Record<string, unknown>;
  cachedAt: number;
}

export interface CachedParticipants {
  eventId: string;
  data: Record<string, unknown>;
  cachedAt: number;
}

export interface CachedTimeline {
  eventId: string;
  entries: Record<string, unknown>[];
  cachedAt: number;
}

export type OfflineDB = Dexie & {
  offlineActions: EntityTable<OfflineAction, 'id'>;
  cachedEvents: EntityTable<CachedEvent, 'id'>;
  cachedParticipants: EntityTable<CachedParticipants, 'eventId'>;
  cachedTimeline: EntityTable<CachedTimeline, 'eventId'>;
};

let dbInstance: OfflineDB | null = null;

export function getOfflineDB(userId: string): OfflineDB {
  if (dbInstance) return dbInstance;

  const db = new Dexie(`athlora-${userId}`) as OfflineDB;

  db.version(1).stores({
    offlineActions: 'id, [status+eventId+createdAt], eventId, status',
    cachedEvents: 'id, [workspaceId+id]',
    cachedParticipants: 'eventId',
    cachedTimeline: 'eventId',
  });

  dbInstance = db;
  return db;
}

export function resetOfflineDB(): void {
  dbInstance = null;
}
