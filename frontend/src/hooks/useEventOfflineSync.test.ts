import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEventOfflineSync } from './useEventOfflineSync';

const networkStatus = vi.hoisted(() => ({
  isDeviceOnline: vi.fn(() => true),
  onConnectivityChange: vi.fn(() => vi.fn()),
  resetNetworkStatus: vi.fn(),
}));

const actionQueue = vi.hoisted(() => ({
  enqueueAction: vi.fn().mockResolvedValue('action-id-1'),
  getQueueStatus: vi.fn().mockResolvedValue({ pending: 2, synced: 5, failed: 1 }),
}));

const syncEngine = vi.hoisted(() => ({
  drainQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../offline/networkStatus', () => networkStatus);
vi.mock('../offline/actionQueue', () => actionQueue);
vi.mock('../offline/syncEngine', () => syncEngine);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  networkStatus.isDeviceOnline.mockReturnValue(true);
  networkStatus.onConnectivityChange.mockReturnValue(vi.fn());
  actionQueue.enqueueAction.mockClear().mockResolvedValue('action-id-1');
  actionQueue.getQueueStatus.mockClear().mockResolvedValue({ pending: 2, synced: 5, failed: 1 });
  syncEngine.drainQueue.mockClear().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useEventOfflineSync', () => {
  const defaultProps = { userId: 'user-1', eventId: 'ev-1', deviceId: 'dev-1' };

  it('initializes with default state', () => {
    const { result } = renderHook(() => useEventOfflineSync(defaultProps));

    expect(result.current.isOnline).toBe(true);
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.queueStatus).toBeNull();
  });

  it('refreshes queue status on mount', async () => {
    renderHook(() => useEventOfflineSync(defaultProps));

    await act(async () => { /* mount effects run */ });

    expect(actionQueue.getQueueStatus).toHaveBeenCalledWith('ev-1', 'user-1');
  });

  it('returns pending and failed counts from queue status', async () => {
    actionQueue.getQueueStatus.mockResolvedValue({ pending: 3, synced: 10, failed: 2 });

    const { result } = renderHook(() => useEventOfflineSync(defaultProps));

    await act(async () => { /* mount effects run */ });

    expect(result.current.pendingCount).toBe(3);
    expect(result.current.failedCount).toBe(2);
  });

  it('enqueue stores an action and refreshes status', async () => {
    const { result } = renderHook(() => useEventOfflineSync(defaultProps));

    await act(async () => { /* mount effects run */ });

    let actionId: string = '';
    await act(async () => {
      actionId = await result.current.enqueue({
        actionType: 'create_entry',
        payload: { value: 11.0 },
      });
    });

    expect(actionId).toBe('action-id-1');
    expect(actionQueue.enqueueAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'create_entry',
        eventId: 'ev-1',
        deviceId: 'dev-1',
      }),
      'user-1',
    );
  });

  it('syncNow drains the queue when online', async () => {
    const { result } = renderHook(() => useEventOfflineSync(defaultProps));

    await act(async () => { /* mount effects run */ });

    await act(async () => {
      await result.current.syncNow();
    });

    expect(syncEngine.drainQueue).toHaveBeenCalledWith('ev-1', 'user-1');
  });

  it('does not sync when offline', async () => {
    networkStatus.isDeviceOnline.mockReturnValue(false);

    const { result } = renderHook(() => useEventOfflineSync(defaultProps));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(syncEngine.drainQueue).not.toHaveBeenCalled();
    expect(result.current.isOnline).toBe(false);
  });

  it('does not sync when already syncing', async () => {
    syncEngine.drainQueue.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
    );

    const { result } = renderHook(() => useEventOfflineSync(defaultProps));

    await act(async () => { /* mount effects run */ });

    await act(async () => {
      result.current.syncNow();
    });

    syncEngine.drainQueue.mockClear();
    await act(async () => {
      await result.current.syncNow();
    });

    expect(syncEngine.drainQueue).not.toHaveBeenCalled();
  });

  it('does not refresh status when userId or eventId is empty', async () => {
    actionQueue.getQueueStatus.mockClear();

    renderHook(() => useEventOfflineSync({ userId: '', eventId: 'ev-1', deviceId: 'dev-1' }));

    await act(async () => { /* mount effects run */ });

    expect(actionQueue.getQueueStatus).not.toHaveBeenCalled();
  });
});
