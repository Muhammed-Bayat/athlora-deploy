import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPasswordTicket, deleteCurrentAccount } from './auth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account API', () => {
  it('requests and unwraps the current user password ticket', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { url: 'https://example.auth0.com/ticket/abc' } }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPasswordTicket()).resolves.toBe('https://example.auth0.com/ticket/abc');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/auth/me/password-ticket');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });

  it('deletes only the current account and handles the empty response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: 'pending' } }), { status: 202 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteCurrentAccount()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/auth/me');
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });
});
