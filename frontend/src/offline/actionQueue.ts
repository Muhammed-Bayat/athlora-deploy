import Dexie from 'dexie';
import { getOfflineDB, type OfflineAction } from './db';

export interface EnqueueActionInput {
  actionType: OfflineAction['actionType'];
  eventId: string;
  entryId?: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  deviceId: string;
}

export async function enqueueAction(input: EnqueueActionInput, userId: string): Promise<string> {
  const db = getOfflineDB(userId);
  const id = crypto.randomUUID();
  const action: OfflineAction = {
    id,
    actionType: input.actionType,
    eventId: input.eventId,
    entryId: input.entryId,
    payload: input.payload,
    expectedVersion: input.expectedVersion,
    status: 'pending',
    deviceId: input.deviceId,
    createdAt: Date.now(),
  };
  await db.offlineActions.add(action);
  return id;
}

export async function getPendingActions(eventId: string, userId: string): Promise<OfflineAction[]> {
  const db = getOfflineDB(userId);
  return db.offlineActions
    .where('[status+eventId+createdAt]')
    .between(
      ['pending', eventId, Dexie.minKey],
      ['pending', eventId, Dexie.maxKey],
    )
    .toArray();
}

export async function getAllPendingActions(userId: string): Promise<OfflineAction[]> {
  const db = getOfflineDB(userId);
  return db.offlineActions.where('status').equals('pending').toArray();
}

export async function markSynced(
  actionId: string,
  receipt: Record<string, unknown>,
  userId: string,
): Promise<void> {
  const db = getOfflineDB(userId);
  await db.offlineActions.update(actionId, {
    status: 'synced',
    syncedAt: Date.now(),
    serverReceipt: receipt,
  });
}

export async function markFailed(actionId: string, error: string, userId: string): Promise<void> {
  const db = getOfflineDB(userId);
  await db.offlineActions.update(actionId, {
    status: 'failed',
    error,
  });
}

export async function resetFailed(actionId: string, userId: string): Promise<void> {
  const db = getOfflineDB(userId);
  await db.offlineActions.update(actionId, {
    status: 'pending',
    error: undefined,
  });
}

export async function getQueueStatus(
  eventId: string,
  userId: string,
): Promise<{ pending: number; synced: number; failed: number }> {
  const db = getOfflineDB(userId);
  const [pending, synced, failed] = await Promise.all([
    db.offlineActions.where({ status: 'pending', eventId }).count(),
    db.offlineActions.where({ status: 'synced', eventId }).count(),
    db.offlineActions.where({ status: 'failed', eventId }).count(),
  ]);
  return { pending, synced, failed };
}
