import {
  createTimelineEntry,
  updateTimelineEntry,
  deleteTimelineEntry,
} from '../api/timeline';
import { getPendingActions, markSynced, markFailed } from './actionQueue';
import type { OfflineAction } from './db';
import type { TimelineEntryCreatePayload, TimelineEntryPatchPayload } from '../types';

export interface DrainResult {
  accepted: number;
  rejected: number;
  duplicates: number;
  failed: number;
}

async function replayAction(action: OfflineAction): Promise<void> {
  switch (action.actionType) {
    case 'create_entry':
      await createTimelineEntry(action.eventId, action.payload as unknown as TimelineEntryCreatePayload);
      break;
    case 'edit_entry':
      if (!action.entryId) throw new Error('edit_entry missing entryId');
      await updateTimelineEntry(action.eventId, action.entryId, action.payload as unknown as TimelineEntryPatchPayload);
      break;
    case 'undo_entry':
      if (!action.entryId) throw new Error('undo_entry missing entryId');
      await deleteTimelineEntry(action.eventId, action.entryId, {
        expectedVersion: action.expectedVersion ?? 0,
      });
      break;
  }
}

export async function drainQueue(
  eventId: string,
  userId: string,
): Promise<DrainResult> {
  const pending = await getPendingActions(eventId, userId);
  if (pending.length === 0) return { accepted: 0, rejected: 0, duplicates: 0, failed: 0 };

  const result: DrainResult = { accepted: 0, rejected: 0, duplicates: 0, failed: 0 };

  for (const action of pending) {
    try {
      await replayAction(action);
      await markSynced(action.id, { replayed: true }, userId);
      result.accepted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      if (msg.includes('not found') || msg.includes('NOT_FOUND') || msg.includes('404')) {
        await markSynced(action.id, { skipped: 'entry_not_found' }, userId);
        result.duplicates++;
      } else {
        await markFailed(action.id, msg, userId);
        result.failed++;
      }
    }
  }

  return result;
}
