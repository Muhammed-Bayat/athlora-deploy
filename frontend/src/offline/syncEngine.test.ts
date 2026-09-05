import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainQueue } from './syncEngine';
import * as api from '../api/sync';
import * as actionQueue from './actionQueue';

vi.mock('../api/sync');
vi.mock('./actionQueue');

describe('Sync Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when queue is empty', async () => {
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([]);

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 0, duplicates: 0, failed: 0 });
    expect(api.postSyncBatch).not.toHaveBeenCalled();
  });

  it('sends batch to sync endpoint and marks actions as synced', async () => {
    const mockActions = [
      {
        id: 'action-1',
        actionType: 'create_entry' as const,
        eventId: 'event-1',
        payload: { athleteId: 'athlete-1', discipline: '100m', entryType: 'attempt', value: 12.34 },
        status: 'pending' as const,
        deviceId: 'device-1',
        createdAt: Date.now(),
      },
    ];

    vi.mocked(actionQueue.getPendingActions).mockResolvedValue(mockActions);
    vi.mocked(api.postSyncBatch).mockResolvedValue({
      receipts: [{ actionId: 'action-1', status: 'accepted', entryId: 'entry-1', serverVersion: 1 }],
      recomputedResults: true,
    });
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 1, rejected: 0, duplicates: 0, failed: 0 });
    expect(api.postSyncBatch).toHaveBeenCalledWith({
      deviceId: 'device-1',
      eventId: 'event-1',
      actions: [
        {
          actionId: 'action-1',
          actionType: 'create_entry',
          payload: { athleteId: 'athlete-1', discipline: '100m', entryType: 'attempt', value: 12.34 },
          clientTimestamp: expect.any(String),
        },
      ],
    });
    expect(actionQueue.markSynced).toHaveBeenCalledWith('action-1', expect.any(Object), 'user-1');
  });

  it('marks actions as failed on network error', async () => {
    const mockActions = [
      {
        id: 'action-1',
        actionType: 'create_entry' as const,
        eventId: 'event-1',
        payload: { athleteId: 'athlete-1' },
        status: 'pending' as const,
        deviceId: 'device-1',
        createdAt: Date.now(),
      },
    ];

    vi.mocked(actionQueue.getPendingActions).mockResolvedValue(mockActions);
    vi.mocked(api.postSyncBatch).mockRejectedValue(new Error('Network error'));
    vi.mocked(actionQueue.markFailed).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 0, duplicates: 0, failed: 1 });
    expect(actionQueue.markFailed).toHaveBeenCalledWith('action-1', 'Network error', 'user-1');
  });

  it('handles rejected actions from server', async () => {
    const mockActions = [
      {
        id: 'action-1',
        actionType: 'edit_entry' as const,
        eventId: 'event-1',
        payload: { entryId: 'entry-1', value: 12.50 },
        expectedVersion: 1,
        status: 'pending' as const,
        deviceId: 'device-1',
        createdAt: Date.now(),
      },
    ];

    vi.mocked(actionQueue.getPendingActions).mockResolvedValue(mockActions);
    vi.mocked(api.postSyncBatch).mockResolvedValue({
      receipts: [{ actionId: 'action-1', status: 'rejected', code: 'VERSION_CONFLICT' }],
      recomputedResults: false,
    });
    vi.mocked(actionQueue.markFailed).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 1, duplicates: 0, failed: 0 });
    expect(actionQueue.markFailed).toHaveBeenCalledWith('action-1', 'VERSION_CONFLICT', 'user-1');
  });
});
