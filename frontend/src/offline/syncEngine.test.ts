import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainQueue } from './syncEngine';
import * as syncApi from '../api/sync';
import * as actionQueue from './actionQueue';

vi.mock('../api/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sync')>();
  return {
    ...actual,
    postSyncBatch: vi.fn(),
  };
});
vi.mock('./actionQueue');

function makeAction(overrides: Partial<Parameters<typeof actionQueue.enqueueAction>[0]> & {
  id?: string;
  createdAt?: number;
} = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    actionType: overrides.actionType ?? ('create_entry' as const),
    eventId: overrides.eventId ?? 'event-1',
    entryId: overrides.entryId,
    payload: overrides.payload ?? { athleteId: 'athlete-1', discipline: '100m', entryType: 'attempt', value: 12.34 },
    expectedVersion: overrides.expectedVersion,
    status: 'pending' as const,
    deviceId: overrides.deviceId ?? 'device-1',
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

describe('Sync Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('separates legacy and session batches in order and pins session workspaces', async () => {
    const target = { disciplineSessionId: crypto.randomUUID(), entrantId: crypto.randomUUID() };
    const legacy = makeAction();
    const session = { ...makeAction(), target, workspaceId: 'original-workspace' };
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([legacy, session]);
    vi.mocked(syncApi.postSyncBatch).mockResolvedValue({ receipts: [], recomputedResults: false });
    await drainQueue('event-1', 'user-1');
    expect(syncApi.postSyncBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(syncApi.postSyncBatch).mock.calls[0][0].actions[0]).not.toHaveProperty('target');
    expect(vi.mocked(syncApi.postSyncBatch).mock.calls[1]).toEqual([
      expect.objectContaining({ actions: [expect.objectContaining({ target, actionId: session.id })] }), 'original-workspace',
    ]);
  });

  it('returns empty result when queue is empty', async () => {
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([]);

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 0, duplicates: 0, failed: 0 });
    expect(syncApi.postSyncBatch).not.toHaveBeenCalled();
  });

  it('sends one ordered batch request and marks accepted receipts synced', async () => {
    const action1 = makeAction({ id: 'action-1', createdAt: 1000 });
    const action2 = makeAction({ id: 'action-2', createdAt: 2000 });
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([action1, action2]);
    vi.mocked(syncApi.postSyncBatch).mockResolvedValue({
      receipts: [
        { actionId: 'action-1', status: 'accepted', entryId: 'entry-1', serverVersion: 1 },
        { actionId: 'action-2', status: 'accepted', entryId: 'entry-2', serverVersion: 1 },
      ],
      recomputedResults: true,
    });
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 2, rejected: 0, duplicates: 0, failed: 0 });
    expect(syncApi.postSyncBatch).toHaveBeenCalledTimes(1);
    expect(syncApi.postSyncBatch).toHaveBeenCalledWith({
      deviceId: 'device-1',
      eventId: 'event-1',
      actions: [
        expect.objectContaining({
          actionId: 'action-1',
          actionType: 'create_entry',
          clientTimestamp: new Date(1000).toISOString(),
        }),
        expect.objectContaining({
          actionId: 'action-2',
          actionType: 'create_entry',
          clientTimestamp: new Date(2000).toISOString(),
        }),
      ],
    });
    expect(actionQueue.markSynced).toHaveBeenCalledWith('action-1', expect.any(Object), 'user-1');
    expect(actionQueue.markSynced).toHaveBeenCalledWith('action-2', expect.any(Object), 'user-1');
    expect(actionQueue.markFailed).not.toHaveBeenCalled();
  });

  it('merges entryId into payload for edit and undo actions', async () => {
    const edit = makeAction({
      id: 'action-edit',
      actionType: 'edit_entry',
      entryId: 'entry-9',
      payload: { expectedVersion: 1, value: 12.5 },
      expectedVersion: 1,
    });
    const undo = makeAction({
      id: 'action-undo',
      actionType: 'undo_entry',
      entryId: 'entry-9',
      payload: { expectedVersion: 2 },
      expectedVersion: 2,
    });
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([edit, undo]);
    vi.mocked(syncApi.postSyncBatch).mockResolvedValue({
      receipts: [
        { actionId: 'action-edit', status: 'accepted', entryId: 'entry-9', serverVersion: 2 },
        { actionId: 'action-undo', status: 'accepted', entryId: 'entry-9', serverVersion: 3 },
      ],
      recomputedResults: true,
    });

    await drainQueue('event-1', 'user-1');

    const body = vi.mocked(syncApi.postSyncBatch).mock.calls[0][0];
    expect(body.actions[0].payload).toMatchObject({ entryId: 'entry-9', expectedVersion: 1, value: 12.5 });
    expect(body.actions[1].payload).toMatchObject({ entryId: 'entry-9', expectedVersion: 2 });
  });

  it('processes mixed receipts without blocking accepted actions', async () => {
    const actions = [
      makeAction({ id: 'a-ok' }),
      makeAction({ id: 'a-dup' }),
      makeAction({ id: 'a-reject' }),
      makeAction({ id: 'a-missing' }),
    ];
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue(actions);
    vi.mocked(syncApi.postSyncBatch).mockResolvedValue({
      receipts: [
        { actionId: 'a-ok', status: 'accepted', entryId: 'e1', serverVersion: 1 },
        { actionId: 'a-dup', status: 'duplicate', entryId: 'e2', serverVersion: 3 },
        { actionId: 'a-reject', status: 'rejected', code: 'VERSION_CONFLICT' },
      ],
      recomputedResults: true,
    });
    vi.mocked(actionQueue.markSynced).mockResolvedValue();
    vi.mocked(actionQueue.markFailed).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 1, rejected: 1, duplicates: 1, failed: 0 });
    expect(actionQueue.markSynced).toHaveBeenCalledTimes(2);
    expect(actionQueue.markSynced).toHaveBeenCalledWith('a-dup', expect.objectContaining({ status: 'duplicate' }), 'user-1');
    expect(actionQueue.markFailed).toHaveBeenCalledTimes(1);
    expect(actionQueue.markFailed).toHaveBeenCalledWith('a-reject', 'VERSION_CONFLICT', 'user-1');
  });

  it('leaves actions pending on transport failure', async () => {
    const action = makeAction({ id: 'action-1' });
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([action]);
    vi.mocked(syncApi.postSyncBatch).mockRejectedValue(new Error('Network request failed'));

    const result = await drainQueue('event-1', 'user-1');

    expect(result).toEqual({ accepted: 0, rejected: 0, duplicates: 0, failed: 0 });
    expect(actionQueue.markSynced).not.toHaveBeenCalled();
    expect(actionQueue.markFailed).not.toHaveBeenCalled();
  });

  it('runs only one concurrent drain for the same event and user', async () => {
    const action = makeAction({ id: 'action-1' });
    let releaseBatch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { releaseBatch = resolve; });
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue([action]);
    vi.mocked(syncApi.postSyncBatch).mockImplementation(async () => {
      await gate;
      return {
        receipts: [{ actionId: 'action-1', status: 'accepted' as const, entryId: 'e1', serverVersion: 1 }],
        recomputedResults: true,
      };
    });
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const first = drainQueue('event-1', 'user-1');
    const second = drainQueue('event-1', 'user-1');
    releaseBatch?.();

    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(syncApi.postSyncBatch).toHaveBeenCalledTimes(1);
  });

  it('chunks large queues into sequential batches of 50 preserving order', async () => {
    const actions = Array.from({ length: 51 }, (_, i) =>
      makeAction({ id: `action-${String(i).padStart(2, '0')}`, createdAt: i }),
    );
    vi.mocked(actionQueue.getPendingActions).mockResolvedValue(actions);
    vi.mocked(syncApi.postSyncBatch)
      .mockResolvedValueOnce({
        receipts: actions.slice(0, 50).map((a) => ({ actionId: a.id, status: 'accepted' as const, entryId: a.id, serverVersion: 1 })),
        recomputedResults: true,
      })
      .mockResolvedValueOnce({
        receipts: [{ actionId: 'action-50', status: 'accepted' as const, entryId: 'e51', serverVersion: 1 }],
        recomputedResults: true,
      });
    vi.mocked(actionQueue.markSynced).mockResolvedValue();

    const result = await drainQueue('event-1', 'user-1');

    expect(syncApi.postSyncBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(syncApi.postSyncBatch).mock.calls[0][0].actions).toHaveLength(50);
    expect(vi.mocked(syncApi.postSyncBatch).mock.calls[1][0].actions).toHaveLength(1);
    expect(vi.mocked(syncApi.postSyncBatch).mock.calls[0][0].actions[0].actionId).toBe('action-00');
    expect(vi.mocked(syncApi.postSyncBatch).mock.calls[1][0].actions[0].actionId).toBe('action-50');
    expect(result.accepted).toBe(51);
  });
});
