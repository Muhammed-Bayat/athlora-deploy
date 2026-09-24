import { describe, expect, it, vi } from 'vitest';
import * as publicActionQueue from './publicActionQueue';

vi.mock('./publicDb', () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    publicOfflineActions: [],
  };

  function createTable(name: string) {
    function makeClause(filter?: (r: Record<string, unknown>) => boolean) {
      const items = filter ? tables[name].filter(filter) : tables[name];
      return {
        between: vi.fn(() => makeClause(filter)),
        toArray: vi.fn(async () => items),
        equals: vi.fn(() => makeClause(filter)),
        count: vi.fn(async () => items.length),
      };
    }
    return {
      add: vi.fn(async (record: Record<string, unknown>) => {
        tables[name].push(record);
        return record.id;
      }),
      where: vi.fn((query: string | Record<string, unknown>) => {
        if (typeof query === 'string') {
          return {
            ...makeClause(),
            equals: vi.fn((value: unknown) => makeClause((record) => record[query] === value)),
          };
        }
        return makeClause((r) =>
          Object.entries(query).every(([k, v]) => r[k] === v),
        );
      }),
      update: vi.fn(async (id: string, changes: Record<string, unknown>) => {
        const idx = tables[name].findIndex((r: Record<string, unknown>) => r.id === id);
        if (idx >= 0) Object.assign(tables[name][idx], changes);
      }),
      count: vi.fn(async () => tables[name].length),
    };
  }

  return {
    getPublicOfflineDB: vi.fn(() => ({
      publicOfflineActions: createTable('publicOfflineActions'),
    })),
  };
});

describe('publicActionQueue', () => {
  it('enqueuePublicAction stores an action', async () => {
    const id = await publicActionQueue.enqueuePublicAction(
      {
        actionType: 'create_entry',
        eventId: 'ev-1',
        payload: { value: 10.5 },
        deviceId: 'dev-1',
      },
      'session-token',
    );

    expect(id).toBeDefined();
  });

  it('getPendingPublicActions returns pending actions', async () => {
    const result = await publicActionQueue.getPendingPublicActions('ev-1', 'session-token');
    expect(Array.isArray(result)).toBe(true);
  });

  it('markPublicSynced updates action status', async () => {
    await publicActionQueue.markPublicSynced('a-1', { serverVersion: 1 }, 'session-token');
  });

  it('markPublicFailed updates action status', async () => {
    await publicActionQueue.markPublicFailed('a-1', 'timeout', 'session-token');
  });

  it('resetPublicFailed resets a failed action', async () => {
    await publicActionQueue.resetPublicFailed('a-1', 'session-token');
  });

  it('getPublicQueueStatus returns counts', async () => {
    const status = await publicActionQueue.getPublicQueueStatus('ev-1', 'session-token');
    expect(status).toHaveProperty('pending');
    expect(status).toHaveProperty('synced');
    expect(status).toHaveProperty('failed');
  });

  it('returns public action details and the latest sync timestamp for an event', async () => {
    const actionId = await publicActionQueue.enqueuePublicAction({
      actionType: 'create_entry', eventId: 'ev-details', payload: { athleteId: 'ath-1' }, deviceId: 'dev-1',
    }, 'session-token');
    await publicActionQueue.markPublicSynced(actionId, { status: 'accepted' }, 'session-token');

    const actions = await publicActionQueue.getPublicQueueActions('ev-details', 'session-token');
    const status = await publicActionQueue.getPublicQueueStatus('ev-details', 'session-token');

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: actionId, deviceId: 'dev-1', status: 'synced' });
    expect(status.lastSyncedAt).toEqual(expect.any(Number));
  });
});
