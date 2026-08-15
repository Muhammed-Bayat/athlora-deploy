import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types';
import {
  ApiError,
  get,
  list,
  remove,
  setAccessTokenGetter,
  syncCurrentUser,
} from './client';

const synchronizedUser: User = {
  id: 'user-1',
  auth0Id: 'auth0|user-1',
  name: 'Coach One',
  email: 'coach@example.com',
  role: 'coach',
  createdAt: '2026-08-13T10:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
};

afterEach(() => {
  setAccessTokenGetter(undefined);
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('retains standard backend error fields in ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'AUTH_EMAIL_REQUIRED',
              message: 'The Auth0 profile must include an email address',
              details: { field: 'email' },
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const error = await get<User>('users', 'user-1').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'AUTH_EMAIL_REQUIRED',
      message: 'The Auth0 profile must include an email address',
      details: { field: 'email' },
    });
  });

  it('synchronizes with one bearer token acquisition and returns the user data', async () => {
    const getToken = vi.fn().mockResolvedValue('access-token');
    setAccessTokenGetter(getToken);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: synchronizedUser }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncCurrentUser()).resolves.toEqual(synchronizedUser);

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/auth/me`,
      expect.objectContaining({ method: 'PUT' }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('handles single and list envelopes and an empty success body', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: synchronizedUser })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [synchronizedUser], meta: { count: 1 } })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(get<User>('users', 'user-1')).resolves.toEqual(synchronizedUser);
    await expect(list<User>('users')).resolves.toEqual({
      data: [synchronizedUser],
      meta: { count: 1 },
    });
    await expect(remove('users', 'user-1')).resolves.toBeUndefined();
  });

  it('handles network failures as ApiError with code NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('Failed to fetch')),
    );

    const error = await get<User>('users', 'user-1').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Failed to fetch',
    });
  });

  it('handles malformed JSON responses as ApiError with code MALFORMED_RESPONSE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      ),
    );

    const error = await get<User>('users', 'user-1').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 200,
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('handles token acquisition failure cleanly', async () => {
    const getToken = vi.fn().mockRejectedValue(new Error('Token expired'));
    setAccessTokenGetter(getToken);

    const error = await get<User>('users', 'user-1').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'AUTH_TOKEN_ACQUISITION_FAILED',
      message: 'Token expired',
    });
  });
});
