import { postSyncBatch, type SyncBatchRequest } from '../api/sync';
import { postPublicSyncBatch, toPublicSyncAction } from '../api/publicSync';
import { getPendingActions, markSynced, markFailed } from './actionQueue';
import { getPendingPublicActions, markPublicSynced, markPublicFailed } from './publicActionQueue';

export interface DrainResult {
  accepted: number;
  rejected: number;
  duplicates: number;
  failed: number;
}

export interface PublicDrainResult extends DrainResult {
  sessionExpired: boolean;
}

export async function drainQueue(
  eventId: string,
  userId: string,
): Promise<DrainResult> {
  const pending = await getPendingActions(eventId, userId);
  if (pending.length === 0) return { accepted: 0, rejected: 0, duplicates: 0, failed: 0 };

  const request: SyncBatchRequest = {
    deviceId: pending[0].deviceId,
    eventId,
    actions: pending.map((a) => ({
      actionId: a.id,
      actionType: a.actionType,
      payload: a.payload,
      expectedVersion: a.expectedVersion,
      clientTimestamp: new Date(a.createdAt).toISOString(),
    })),
  };

  let response: { receipts: Array<{ actionId: string; status: string; code?: string }>; recomputedResults: boolean };
  try {
    response = await postSyncBatch(request);
  } catch (err) {
    for (const action of pending) {
      await markFailed(action.id, err instanceof Error ? err.message : 'Network error', userId);
    }
    return { accepted: 0, rejected: 0, duplicates: 0, failed: pending.length };
  }

  const result: DrainResult = { accepted: 0, rejected: 0, duplicates: 0, failed: 0 };

  for (const receipt of response.receipts) {
    const action = pending.find((a) => a.id === receipt.actionId);
    if (!action) continue;

    switch (receipt.status) {
      case 'accepted':
        await markSynced(action.id, receipt as unknown as Record<string, unknown>, userId);
        result.accepted++;
        break;
      case 'duplicate':
        await markSynced(action.id, receipt as unknown as Record<string, unknown>, userId);
        result.duplicates++;
        break;
      case 'rejected':
        await markFailed(action.id, receipt.code ?? 'REJECTED', userId);
        result.rejected++;
        break;
    }
  }

  return result;
}

export async function drainPublicQueue(
  eventId: string,
  sessionToken: string,
): Promise<PublicDrainResult> {
  const pending = await getPendingPublicActions(eventId, sessionToken);
  if (pending.length === 0) return { accepted: 0, rejected: 0, duplicates: 0, failed: 0, sessionExpired: false };

  const request = {
    eventId,
    deviceId: pending[0].deviceId,
    actions: pending.map(toPublicSyncAction),
  };

  let response: { receipts: Array<{ actionId: string; status: string; code?: string }>; recomputedResults: boolean };
  let sessionExpired = false;
  try {
    response = await postPublicSyncBatch(sessionToken, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    sessionExpired = message.includes('Invalid or expired');
    for (const action of pending) {
      await markPublicFailed(action.id, message, sessionToken);
    }
    return { accepted: 0, rejected: 0, duplicates: 0, failed: pending.length, sessionExpired };
  }

  const result: DrainResult = { accepted: 0, rejected: 0, duplicates: 0, failed: 0 };

  for (const receipt of response.receipts) {
    const action = pending.find((a) => a.id === receipt.actionId);
    if (!action) continue;

    switch (receipt.status) {
      case 'accepted':
        await markPublicSynced(action.id, receipt as unknown as Record<string, unknown>, sessionToken);
        result.accepted++;
        break;
      case 'duplicate':
        await markPublicSynced(action.id, receipt as unknown as Record<string, unknown>, sessionToken);
        result.duplicates++;
        break;
      case 'rejected':
        await markPublicFailed(action.id, receipt.code ?? 'REJECTED', sessionToken);
        result.rejected++;
        break;
    }
  }

  return { ...result, sessionExpired };
}
