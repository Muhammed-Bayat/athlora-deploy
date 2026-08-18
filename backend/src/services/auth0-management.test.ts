import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAuth0PasswordTicket,
  deleteAuth0User,
  resetAuth0ManagementTokenCacheForTests,
} from './auth0-management.js';

beforeEach(() => {
  process.env.AUTH0_DOMAIN = 'athlora.eu.auth0.com';
  process.env.AUTH0_MANAGEMENT_CLIENT_ID = 'management-client';
  process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = 'management-secret';
  process.env.AUTH0_PASSWORD_RETURN_URL = 'https://athlora.example.com/account';
  resetAuth0ManagementTokenCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AUTH0_DOMAIN;
  delete process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  delete process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
  delete process.env.AUTH0_PASSWORD_RETURN_URL;
});

function tokenResponse() {
  return new Response(JSON.stringify({ access_token: 'management-token', expires_in: 3600 }));
}

describe('Auth0 management client', () => {
  it('obtains a least-bound M2M token and URL-encodes the deleted subject', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteAuth0User('auth0|coach/name');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://athlora.eu.auth0.com/oauth/token', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: 'management-client',
        client_secret: 'management-secret',
        audience: 'https://athlora.eu.auth0.com/api/v2/',
        scope: 'delete:users create:user_tickets',
      }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://athlora.eu.auth0.com/api/v2/users/auth0%7Ccoach%2Fname',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('treats an already-missing Auth0 identity as deletion success', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 404 })));
    await expect(deleteAuth0User('auth0|gone')).resolves.toBeUndefined();
  });

  it('creates a short-lived password ticket with a server-controlled return URL', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'https://athlora.eu.auth0.com/ticket/abc' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAuth0PasswordTicket('auth0|coach')).resolves.toBe('https://athlora.eu.auth0.com/ticket/abc');
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        user_id: 'auth0|coach',
        result_url: 'https://athlora.example.com/account',
        ttl_sec: 900,
        mark_email_as_verified: false,
      }),
    }));
  });

  it('reuses a valid management token without exposing it', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteAuth0User('auth0|one');
    await deleteAuth0User('auth0|two');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses safe errors for missing configuration and upstream failures', async () => {
    delete process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
    await expect(deleteAuth0User('auth0|coach')).rejects.toMatchObject({
      status: 503,
      code: 'AUTH0_MANAGEMENT_NOT_CONFIGURED',
    });

    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = 'management-secret';
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('secret upstream detail')));
    await expect(deleteAuth0User('auth0|coach')).rejects.toMatchObject({
      status: 502,
      code: 'AUTH0_MANAGEMENT_UNAVAILABLE',
      message: 'Account management is temporarily unavailable',
    });
  });
});
