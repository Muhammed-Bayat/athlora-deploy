import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainQueue } from './syncEngine';
import * as timelineApi from '../api/timeline';
import * as actionQueue from './actionQueue';

vi.mock('../api/timeline');
vi.mock('./actionQueue');

describe('Sync Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty result when queue is empty', async () => {
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([]);

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 0, duplicates: 0, failed: 0 });
    expect(timelineApi.createTimelineEntry).not.toHaveBeenCalled();
  });

  it('replays create_entry actions and marks them synced', async () => {
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
    vi.mocked(timelineApi.createTimelineEntry).mockResolvedValue({ id: 'entry-1' } as never);
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 1, rejected: 0, duplicates: 0, failed: 0 });
    expect(timelineApi.createTimelineEntry).toHaveBeenCalledWith('event-1', mockActions[0].payload);
    expect(actionQueue.markSynced).toHaveBeenCalledWith('action-1', expect.any(Object), 'user-1');
  });

  it('replays edit_entry actions and marks them synced', async () => {
    const mockActions = [
      {
        id: 'action-1',
        actionType: 'edit_entry' as const,
        eventId: 'event-1',
        entryId: 'entry-1',
        payload: { expectedVersion: 1, value: 12.50 },
        expectedVersion: 1,
        status: 'pending' as const,
        deviceId: 'device-1',
        createdAt: Date.now(),
      },
    ];

    vi.mocked(actionQueue.getPendingActions).mockResolvedValue(mockActions);
    vi.mocked(timelineApi.updateTimelineEntry).mockResolvedValue({ id: 'entry-1' } as never);
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 1, rejected: 0, duplicates: 0, failed: 0 });
    expect(timelineApi.updateTimelineEntry).toHaveBeenCalledWith('event-1', 'entry-1', mockActions[0].payload);
    expect(actionQueue.markSynced).toHaveBeenCalled();
  });

  it('replays undo_entry actions and marks them synced', async () => {
    const mockActions = [
      {
        id: 'action-1',
        actionType: 'undo_entry' as const,
        eventId: 'event-1',
        entryId: 'entry-1',
        payload: { expectedVersion: 1 },
        expectedVersion: 1,
        status: 'pending' as const,
        deviceId: 'device-1',
        createdAt: Date.now(),
      },
    ];

    vi.mocked(actionQueue.getPendingActions).mockResolvedValue(mockActions);
    vi.mocked(timelineApi.deleteTimelineEntry).mockResolvedValue();
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 1, rejected: 0, duplicates: 0, failed: 0 });
    expect(timelineApi.deleteTimelineEntry).toHaveBeenCalledWith('event-1', 'entry-1', { expectedVersion: 1 });
    expect(actionQueue.markSynced).toHaveBeenCalled();
  });

  it('marks actions as failed on replay error', async () => {
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
    vi.mocked(timelineApi.createTimelineEntry).mockRejectedValue(new Error('Server error'));
    vi.mocked(actionQueue.markFailed).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 0, duplicates: 0, failed: 1 });
    expect(actionQueue.markFailed).toHaveBeenCalledWith('action-1', 'Server error', 'user-1');
  });

  it('marks 404 errors as duplicates (already applied)', async () => {
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
    vi.mocked(timelineApi.createTimelineEntry).mockRejectedValue(new Error('Not found 404'));
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 0, duplicates: 1, failed: 0 });
    expect(actionQueue.markSynced).toHaveBeenCalled();
  });
});
