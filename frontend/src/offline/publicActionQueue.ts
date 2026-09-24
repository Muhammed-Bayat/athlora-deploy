import Dexie from 'dexie';
import { getPublicOfflineDB, type PublicOfflineAction } from './publicDb';
import { isSessionTarget, type SessionTarget } from '../types/meets';

export interface PublicOfflineQueueStatus {
  pending: number;
  synced: number;
  failed: number;
  lastSyncedAt?: number | null;
}

export interface EnqueuePublicActionInput {
  target?: SessionTarget;
  actionType: PublicOfflineAction['actionType'];
  eventId: string;
  entryId?: string;
  payload: Record<string, unknown>;
  expectedVersion?: number;
  deviceId: string;
}

export async function enqueuePublicAction(
  input: EnqueuePublicActionInput,
  sessionToken: string,
): Promise<string> {
  if (input.target !== undefined && !isSessionTarget(input.target)) throw new Error('Session actions require a complete target');
  const db = getPublicOfflineDB(sessionToken);
  const id = crypto.randomUUID();
  const action: PublicOfflineAction = {
    ...(input.target ? { target: input.target } : {}),
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
  await db.publicOfflineActions.add(action);
  return id;
}

export async function getPendingPublicActions(
  eventId: string,
  sessionToken: string,
): Promise<PublicOfflineAction[]> {
  const db = getPublicOfflineDB(sessionToken);
  return db.publicOfflineActions
    .where('[status+eventId+createdAt]')
    .between(
      ['pending', eventId, Dexie.minKey],
      ['pending', eventId, Dexie.maxKey],
    )
    .toArray();
}

export async function getPublicQueueActions(
  eventId: string,
  sessionToken: string,
): Promise<PublicOfflineAction[]> {
  const db = getPublicOfflineDB(sessionToken);
  const actions = await db.publicOfflineActions.where('eventId').equals(eventId).toArray();
  return actions.sort((left, right) => right.createdAt - left.createdAt);
}

export async function markPublicSynced(
  actionId: string,
  receipt: Record<string, unknown>,
  sessionToken: string,
): Promise<void> {
  const db = getPublicOfflineDB(sessionToken);
  await db.publicOfflineActions.update(actionId, {
    status: 'synced',
    syncedAt: Date.now(),
    serverReceipt: receipt,
  });
}

export async function markPublicFailed(
  actionId: string,
  error: string,
  sessionToken: string,
): Promise<void> {
  const db = getPublicOfflineDB(sessionToken);
  await db.publicOfflineActions.update(actionId, {
    status: 'failed',
    error,
  });
}

export async function resetPublicFailed(
  actionId: string,
  sessionToken: string,
): Promise<void> {
  const db = getPublicOfflineDB(sessionToken);
  await db.publicOfflineActions.update(actionId, {
    status: 'pending',
    error: undefined,
  });
}

export async function getPublicQueueStatus(
  eventId: string,
  sessionToken: string,
): Promise<PublicOfflineQueueStatus> {
  const db = getPublicOfflineDB(sessionToken);
  const [pending, synced, failed, actions] = await Promise.all([
    db.publicOfflineActions.where({ status: 'pending', eventId }).count(),
    db.publicOfflineActions.where({ status: 'synced', eventId }).count(),
    db.publicOfflineActions.where({ status: 'failed', eventId }).count(),
    getPublicQueueActions(eventId, sessionToken),
  ]);
  const syncedAt = actions
    .map((action) => action.syncedAt ?? 0)
    .reduce((latest, value) => Math.max(latest, value), 0);
  return { pending, synced, failed, lastSyncedAt: syncedAt || null };
}
