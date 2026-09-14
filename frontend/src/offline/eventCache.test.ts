import { describe, expect, it, vi } from 'vitest';
import * as eventCache from './eventCache';

vi.mock('./db', () => {
  const store: Record<string, Record<string, unknown>> = {};

  return {
    getOfflineDB: vi.fn(() => ({
      cachedEvents: {
        put: vi.fn(async (record: Record<string, unknown>) => {
          store[record.id as string] = record;
        }),
        get: vi.fn(async (id: string) => store[id] ?? null),
        clear: vi.fn(async () => { Object.keys(store).forEach((k) => delete store[k]); }),
      },
      cachedParticipants: {
        put: vi.fn(),
        get: vi.fn(async () => null),
        clear: vi.fn(),
      },
      cachedTimeline: {
        put: vi.fn(),
        get: vi.fn(async () => null),
        clear: vi.fn(),
      },
    })),
  };
});

describe('eventCache', () => {
  it('cacheEventData stores event, participants, and timeline', async () => {
    await eventCache.cacheEventData(
      'ev-1',
      'ws-1',
      { title: 'Test Event' },
      { data: [] },
      [{ id: 'entry-1' }],
      'user-1',
    );
  });

  it('getCachedEventData retrieves cached data', async () => {
    const result = await eventCache.getCachedEventData('ev-1', 'user-1');

    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('participants');
    expect(result).toHaveProperty('timeline');
  });

  it('clearEventCache clears all cached data', async () => {
    await eventCache.clearEventCache('user-1');
  });
});
