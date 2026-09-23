import Dexie, { type EntityTable } from 'dexie';
import type { SessionTarget } from '../types/meets';

export interface OfflineAction {
  target?: SessionTarget;
  workspaceId?: string;
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

export interface CachedSession {
  key: string;
  workspaceId: string;
  eventId: string;
  disciplineSessionId: string;
  data: Record<string, unknown>;
  cachedAt: number;
}

export type OfflineDB = Dexie & {
  offlineActions: EntityTable<OfflineAction, 'id'>;
  cachedEvents: EntityTable<CachedEvent, 'id'>;
  cachedParticipants: EntityTable<CachedParticipants, 'eventId'>;
  cachedTimeline: EntityTable<CachedTimeline, 'eventId'>;
  cachedSessions: EntityTable<CachedSession, 'key'>;
};

const dbInstances = new Map<string, OfflineDB>();

export function getOfflineDB(userId: string): OfflineDB {
  const existing = dbInstances.get(userId);
  if (existing) return existing;

  const db = new Dexie(`athlora-${userId}`) as OfflineDB;

  db.version(1).stores({
    offlineActions: 'id, [status+eventId+createdAt], eventId, status',
    cachedEvents: 'id, [workspaceId+id]',
    cachedParticipants: 'eventId',
    cachedTimeline: 'eventId',
  });

  db.version(2).stores({
    offlineActions: 'id, [status+eventId+createdAt], eventId, status, workspaceId',
    cachedSessions: 'key, [workspaceId+eventId+disciplineSessionId]',
  });

  dbInstances.set(userId, db);
  return db;
}

export function resetOfflineDB(): void {
  for (const db of dbInstances.values()) db.close();
  dbInstances.clear();
}
