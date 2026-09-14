import { describe, expect, it, vi } from 'vitest';
import * as actionQueue from './actionQueue';

vi.mock('./db', () => {
  const stores: Record<string, Record<string, unknown>[]> = {
    offlineActions: [],
  };
  let nextId = 0;

  function createTable(name: string) {
    function makeClause(filter?: (r: Record<string, unknown>) => boolean) {
      const items = filter ? stores[name].filter(filter) : stores[name];
      return {
        between: vi.fn(() => makeClause(filter)),
        toArray: vi.fn(async () => items),
        equals: vi.fn(() => makeClause(filter)),
        count: vi.fn(async () => items.length),
      };
    }
    return {
      add: vi.fn(async (record: Record<string, unknown>) => {
        stores[name].push(record);
        return record.id ?? `id-${nextId++}`;
      }),
      where: vi.fn((query: Record<string, unknown>) => {
        if (typeof query === 'string') {
          return makeClause((r) => r.status === query);
        }
        return makeClause((r) =>
          Object.entries(query).every(([k, v]) => r[k] === v),
        );
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = stores[name].findIndex((r: Record<string, unknown>) => r.id === id);
        if (idx >= 0) Object.assign(stores[name][idx], changes);
      }),
      count: vi.fn(async () => stores[name].length),
    };
  }

  const tables = {
    offlineActions: createTable('offlineActions'),
  };

  return {
    getOfflineDB: vi.fn(() => ({
      offlineActions: tables.offlineActions,
    })),
  };
});

describe('actionQueue', () => {
  it('enqueueAction stores an action with pending status', async () => {
    const id = await actionQueue.enqueueAction(
      {
        actionType: 'create_entry',
        eventId: 'ev-1',
        payload: { value: 11.0 },
        deviceId: 'dev-1',
      },
      'user-1',
    );

    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('markSynced updates action to synced status', async () => {
    const markSyncedSpy = vi.spyOn(
      (await import('./actionQueue')) as never,
      'markSynced' as never,
    );
    await actionQueue.markSynced('action-1', { serverVersion: 1 }, 'user-1');
    expect(markSyncedSpy).toBeDefined();
  });

  it('markFailed updates action to failed status', async () => {
    const markFailedSpy = vi.spyOn(
      (await import('./actionQueue')) as never,
      'markFailed' as never,
    );
    await actionQueue.markFailed('action-1', 'network error', 'user-1');
    expect(markFailedSpy).toBeDefined();
  });

  it('resetFailed resets a failed action to pending', async () => {
    const resetFailedSpy = vi.spyOn(
      (await import('./actionQueue')) as never,
      'resetFailed' as never,
    );
    await actionQueue.resetFailed('action-1', 'user-1');
    expect(resetFailedSpy).toBeDefined();
  });

  it('getQueueStatus returns counts by status', async () => {
    const status = await actionQueue.getQueueStatus('ev-1', 'user-1');
    expect(status).toHaveProperty('pending');
    expect(status).toHaveProperty('synced');
    expect(status).toHaveProperty('failed');
  });

  it('getAllPendingActions returns pending actions', async () => {
    const result = await actionQueue.getAllPendingActions('user-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
