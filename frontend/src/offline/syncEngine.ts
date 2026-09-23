import { postSyncBatch, toSyncAction } from '../api/sync';
import { postPublicSyncBatch, toPublicSyncAction } from '../api/publicSync';
import { getPendingActions, markSynced, markFailed } from './actionQueue';
import { getPendingPublicActions, markPublicSynced, markPublicFailed } from './publicActionQueue';
import type { OfflineAction } from './db';

export interface DrainResult {
  accepted: number;
  rejected: number;
  duplicates: number;
  failed: number;
}

export interface PublicDrainResult extends DrainResult {
  sessionExpired: boolean;
}

const BATCH_CHUNK_SIZE = 50;
const inFlightDrains = new Map<string, Promise<DrainResult>>();

function emptyResult(): DrainResult {
  return { accepted: 0, rejected: 0, duplicates: 0, failed: 0 };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function processReceipts(
  pending: OfflineAction[],
  receipts: Array<{ actionId: string; status: string; code?: string; serverVersion?: number; entryId?: string }>,
  userId: string,
): Promise<DrainResult> {
  const result = emptyResult();
  const byId = new Map(pending.map((action) => [action.id, action]));

  for (const receipt of receipts) {
    const action = byId.get(receipt.actionId);
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

async function drainQueueUnsafe(eventId: string, userId: string): Promise<DrainResult> {
  const pending = await getPendingActions(eventId, userId);
  if (pending.length === 0) return emptyResult();

  const deviceId = pending[0].deviceId;
  const result = emptyResult();

  try {
    for (const actions of chunk(pending, BATCH_CHUNK_SIZE)) {
      const response = await postSyncBatch({
        deviceId,
        eventId,
        actions: actions.map(toSyncAction),
      });
      const chunkResult = await processReceipts(actions, response.receipts, userId);
      result.accepted += chunkResult.accepted;
      result.rejected += chunkResult.rejected;
      result.duplicates += chunkResult.duplicates;
      result.failed += chunkResult.failed;
    }
    return result;
  } catch {
    // Transport/HTTP failure: leave actions pending so the queue is preserved
    // and the next reconnect/interval can retry. Idempotent actionIds make
    // safe re-sends after partial server processing.
    return emptyResult();
  }
}

export async function drainQueue(
  eventId: string,
  userId: string,
): Promise<DrainResult> {
  const key = `${eventId}:${userId}`;
  const existing = inFlightDrains.get(key);
  if (existing) return existing;

  const run = drainQueueUnsafe(eventId, userId).finally(() => {
    inFlightDrains.delete(key);
  });
  inFlightDrains.set(key, run);
  return run;
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
