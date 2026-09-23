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

function chunk<T extends { target?: unknown; workspaceId?: string; deviceId: string }>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (const item of items) {
    const current = chunks[chunks.length - 1];
    const first = current?.[0];
    if (!first || current.length === size || Boolean(first.target) !== Boolean(item.target)
      || first.workspaceId !== item.workspaceId || first.deviceId !== item.deviceId) chunks.push([item]);
    else current.push(item);
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

  const result = emptyResult();

  try {
    for (const actions of chunk(pending, BATCH_CHUNK_SIZE)) {
      const batch = {
        deviceId: actions[0].deviceId,
        eventId,
        actions: actions.map(toSyncAction),
      };
      // Legacy v1 actions retain their old workspace behavior. New actions are pinned at enqueue time.
      const response = actions[0].workspaceId ? await postSyncBatch(batch, actions[0].workspaceId) : await postSyncBatch(batch);
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

  const result: DrainResult = { accepted: 0, rejected: 0, duplicates: 0, failed: 0 };
  for (const actions of chunk(pending, BATCH_CHUNK_SIZE)) {
    try {
      const response = await postPublicSyncBatch(sessionToken, { eventId, deviceId: actions[0].deviceId, actions: actions.map(toPublicSyncAction) });
      for (const receipt of response.receipts) {
        const action = actions.find((item) => item.id === receipt.actionId);
        if (!action) continue;
        if (receipt.status === 'accepted' || receipt.status === 'duplicate') {
          await markPublicSynced(action.id, receipt as unknown as Record<string, unknown>, sessionToken);
          if (receipt.status === 'accepted') result.accepted++;
          else result.duplicates++;
        } else if (receipt.status === 'rejected') {
          await markPublicFailed(action.id, receipt.code ?? 'REJECTED', sessionToken);
          result.rejected++;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      const sessionExpired = message.includes('Invalid or expired') || message.includes('Public logger access is unavailable');
      // New session actions remain pending on transport failure so stable UUIDs can retry.
      if (!actions[0].target) {
        for (const action of actions) await markPublicFailed(action.id, message, sessionToken);
        result.failed += actions.length;
      }
      return { ...result, sessionExpired };
    }
  }
  return { ...result, sessionExpired: false };
}
