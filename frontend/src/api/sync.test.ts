import { afterEach, describe, expect, it, vi } from 'vitest';
import { postSyncBatch, toSyncAction } from './sync';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('sync API', () => {
  it('posts a sync batch with the correct payload', async () => {
    const receipts = [{ actionId: 'a1', status: 'accepted' as const }];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ data: { receipts, recomputedResults: true } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const batch = {
      deviceId: 'dev-1',
      eventId: 'ev-1',
      actions: [
        {
          actionId: 'a1',
          actionType: 'create_entry' as const,
          payload: { value: 11.2 },
          clientTimestamp: '2026-09-01T10:00:00.000Z',
        },
      ],
    };

    const result = await postSyncBatch(batch);

    expect(result.receipts).toEqual(receipts);
    expect(result.recomputedResults).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/sync/batch'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(batch) }),
    );
  });

  it('maps offline actions with stable actionId and entryId-in-payload', () => {
    const action = toSyncAction({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actionType: 'edit_entry',
      entryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payload: { expectedVersion: 2, value: 11.1 },
      expectedVersion: 2,
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    });

    expect(action).toEqual({
      actionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actionType: 'edit_entry',
      payload: {
        entryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        expectedVersion: 2,
        value: 11.1,
      },
      expectedVersion: 2,
      clientTimestamp: '2026-01-02T03:04:05.000Z',
    });
  });
});
