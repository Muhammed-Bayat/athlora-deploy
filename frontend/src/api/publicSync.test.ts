import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicSync from './publicSync';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('publicSync API', () => {
  it('posts a public sync batch with authorization header', async () => {
    const receipts = [{ actionId: 'pa-1', status: 'accepted' as const }];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ receipts, recomputedResults: false }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const batch = {
      eventId: 'ev-1',
      deviceId: 'dev-1',
      actions: [
        {
          actionId: 'pa-1',
          actionType: 'edit_entry' as const,
          payload: { value: 10.5 },
          clientTimestamp: '2026-09-01T10:00:00.000Z',
        },
      ],
    };

    const result = await publicSync.postPublicSyncBatch('session-token-abc', batch);

    expect(result.receipts).toEqual(receipts);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/public/logger/sync/batch'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token-abc',
        }),
      }),
    );
  });

  it('throws on network failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publicSync.postPublicSyncBatch('token', {
        eventId: 'ev-1',
        deviceId: 'dev-1',
        actions: [],
      }),
    ).rejects.toThrow('Network request failed');
  });

  it('throws the server error message on non-ok response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ error: 'Rate limited' }, 429),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publicSync.postPublicSyncBatch('token', {
        eventId: 'ev-1',
        deviceId: 'dev-1',
        actions: [],
      }),
    ).rejects.toThrow('Rate limited');
  });

  it('throws a fallback error when response body has no error field', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ unexpected: true }, 500),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      publicSync.postPublicSyncBatch('token', {
        eventId: 'ev-1',
        deviceId: 'dev-1',
        actions: [],
      }),
    ).rejects.toThrow('Request failed with status 500');
  });

  it('converts a PublicOfflineAction to a PublicSyncAction', () => {
    const action = {
      id: 'action-1',
      actionType: 'create_entry' as const,
      eventId: 'ev-1',
      payload: { value: 11.0 },
      expectedVersion: 3,
      createdAt: 1693574400000,
      status: 'pending' as const,
      deviceId: 'dev-1',
    };

    const result = publicSync.toPublicSyncAction(action);

    expect(result.actionId).toBe('action-1');
    expect(result.actionType).toBe('create_entry');
    expect(result.payload).toEqual({ value: 11.0 });
    expect(result.expectedVersion).toBe(3);
    expect(result.clientTimestamp).toBe(new Date(1693574400000).toISOString());
  });
});
