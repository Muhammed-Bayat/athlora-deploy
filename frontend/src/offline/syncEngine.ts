import { postSyncBatch, type SyncBatchRequest } from '../api/sync';
import { getPendingActions, markSynced, markFailed } from './actionQueue';

export interface DrainResult {
  accepted: number;
  rejected: number;
  duplicates: number;
  failed: number;
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
