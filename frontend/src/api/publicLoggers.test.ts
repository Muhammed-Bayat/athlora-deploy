import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPublicLoggerEntry,
  createPublicLoggerLink,
  getPublicLoggerSnapshot,
  listPublicLoggerLinks,
  removePublicLoggerEntry,
  revokePublicLoggerLink,
  startPublicLoggerSession,
  updatePublicLoggerEntry,
} from './publicLoggers';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const SESSION = 'public-session-token';

afterEach(() => vi.unstubAllGlobals());

function response(data: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

describe('public logger API', () => {
  it('creates, lists, and revokes authenticated links', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ data: { link: { id: ENTRY_ID }, token: 'link-token' } }, 201))
      .mockResolvedValueOnce(response({ data: [], meta: { count: 0 } }))
      .mockResolvedValueOnce(response(undefined, 204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPublicLoggerLink(EVENT_ID)).resolves.toEqual({ link: { id: ENTRY_ID }, token: 'link-token' });
    await expect(listPublicLoggerLinks(EVENT_ID)).resolves.toEqual({ data: [], meta: { count: 0 } });
    await expect(revokePublicLoggerLink(EVENT_ID, ENTRY_ID)).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0]).toContain(`/api/v1/events/${EVENT_ID}/public-loggers`);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('sends the public session header for snapshot and entry mutations', async () => {
    const snapshot = { event: { id: EVENT_ID }, participants: [], timeline: [] };
    const entry = { id: ENTRY_ID, eventId: EVENT_ID };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ data: { sessionToken: SESSION, snapshot } }, 201))
      .mockResolvedValueOnce(response({ data: snapshot }))
      .mockResolvedValueOnce(response({ data: entry }, 201))
      .mockResolvedValueOnce(response({ data: entry }))
      .mockResolvedValueOnce(response(undefined, 204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(startPublicLoggerSession('link-token', 'Sam', 'North Club')).resolves.toEqual({ sessionToken: SESSION, snapshot });
    await expect(getPublicLoggerSnapshot(SESSION, EVENT_ID)).resolves.toEqual(snapshot);
    await expect(createPublicLoggerEntry(SESSION, EVENT_ID, { athleteId: ENTRY_ID, entryType: 'attempt', value: 11.2, unit: 'seconds', isFoul: false, incidentType: null, noteText: null })).resolves.toEqual(entry);
    await expect(updatePublicLoggerEntry(SESSION, EVENT_ID, ENTRY_ID, { expectedVersion: 1, value: 11.1 })).resolves.toEqual(entry);
    await expect(removePublicLoggerEntry(SESSION, EVENT_ID, ENTRY_ID, { expectedVersion: 2 })).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST', body: JSON.stringify({ linkToken: 'link-token', name: 'Sam', club: 'North Club' }) }));
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(new Headers(call[1]?.headers).get('X-Public-Logger-Session')).toBe(SESSION);
    }
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ expectedVersion: 1, value: 11.1 }) }));
    expect(fetchMock.mock.calls[4]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('returns structured public API and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response({ error: { code: 'SESSION_INVALID', message: 'Unavailable' } }, 401)));
    await expect(getPublicLoggerSnapshot(SESSION, EVENT_ID)).rejects.toMatchObject({ status: 401, code: 'SESSION_INVALID' });

    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));
    await expect(startPublicLoggerSession('link-token', 'Sam', 'North Club')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
