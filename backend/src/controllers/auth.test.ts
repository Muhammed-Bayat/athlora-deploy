import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import { syncCurrentUser } from './auth.js';

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

const query = vi.fn();
const json = vi.fn();
const next = vi.fn() as unknown as NextFunction;

function request(): Request {
  return {
    auth0: { auth0Id: 'auth0|user-1', accessToken: 'access-token' },
  } as unknown as Request;
}

function response(): Response {
  return { json } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH0_DOMAIN = 'athlora.eu.auth0.com';
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncCurrentUser', () => {
  it('upserts a verified Auth0 profile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: 'auth0|user-1',
          name: 'Coach One',
          email: 'coach@example.com',
        }),
      }),
    );
    query.mockResolvedValue({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          auth0_id: 'auth0|user-1',
          name: 'Coach One',
          email: 'coach@example.com',
          role: 'coach',
          created_at: new Date('2026-08-13T10:00:00.000Z'),
          updated_at: new Date('2026-08-13T10:00:00.000Z'),
        },
      ],
    });

    await syncCurrentUser(request(), response(), next);

    expect(fetch).toHaveBeenCalledWith('https://athlora.eu.auth0.com/userinfo', {
      headers: { Authorization: 'Bearer access-token' },
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (auth0_id) DO UPDATE'), [
      'auth0|user-1',
      'Coach One',
      'coach@example.com',
    ]);
    expect(json).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        auth0Id: 'auth0|user-1',
        role: 'coach',
        createdAt: '2026-08-13T10:00:00.000Z',
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a profile whose subject does not match the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: 'auth0|different-user',
          name: 'Different User',
          email: 'different@example.com',
        }),
      }),
    );

    await syncCurrentUser(request(), response(), next);

    expect(query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401, code: 'UNAUTHORIZED' }),
    );
  });

  it('rejects a whitespace-only profile email before querying', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sub: 'auth0|user-1',
          name: '   ',
          email: '   ',
        }),
      }),
    );

    await syncCurrentUser(request(), response(), next);

    expect(query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 422, code: 'AUTH_EMAIL_REQUIRED' }),
    );
  });
});
