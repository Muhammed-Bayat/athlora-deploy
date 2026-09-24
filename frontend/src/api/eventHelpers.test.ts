import { afterEach, describe, expect, it, vi } from 'vitest';
import * as eventHelpers from './eventHelpers';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('eventHelpers API', () => {
  it('reads the active offline logger designation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({
      data: { grantId: 'grant-1', userId: 'user-1', name: 'Coach Avery', deviceId: 'device-1' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await eventHelpers.getOfflineLoggerDesignation('ev-1');

    expect(result).toMatchObject({ name: 'Coach Avery', deviceId: 'device-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/events/ev-1/helpers/offline-logger'),
      expect.any(Object),
    );
  });

  it('designates an offline logger with the correct URL and body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { success: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await eventHelpers.designateOfflineLogger('ev-1', 'grant-1', 'device-1');

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/events/ev-1/helpers/grants/grant-1/designate-offline-logger'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({ deviceId: 'device-1' });
  });

  it('revokes an offline logger designation via DELETE', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { success: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await eventHelpers.revokeOfflineLoggerDesignation('ev-2', 'grant-2');

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/events/ev-2/helpers/grants/grant-2/designate-offline-logger'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('transfers offline logger designation between grants', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ data: { success: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await eventHelpers.transferOfflineLoggerDesignation('ev-3', 'from-grant', 'to-grant');

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/events/ev-3/helpers/transfer-offline-logger'),
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({ fromGrantId: 'from-grant', toGrantId: 'to-grant' });
  });
});
