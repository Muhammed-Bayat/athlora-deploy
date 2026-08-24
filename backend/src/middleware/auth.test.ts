import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool } from '../db/client.js';
import {
  getApplicationUserContext,
  getVerifiedAuth0Context,
  resolveApplicationUser,
  verifyAuth0Token,
} from './auth.js';

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'keyset'),
  jwtVerify: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  getPool: vi.fn(),
}));

const query = vi.fn();
const json = vi.fn();
const status = vi.fn(() => ({ json }));

function request(authorization?: string): Request {
  return {
    headers: authorization ? { authorization } : {},
  } as unknown as Request;
}

function response(): Response {
  return { status, json } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH0_DOMAIN = 'athlora.eu.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.athlora.test';
  vi.mocked(getPool).mockReturnValue({ query } as unknown as ReturnType<typeof getPool>);
});

describe('verifyAuth0Token', () => {
  it('preserves the standard missing-token response', async () => {
    const next = vi.fn() as unknown as NextFunction;

    await verifyAuth0Token(request(), response(), next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Missing bearer token', details: {} },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves the standard invalid-token response', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('invalid token'));
    const next = vi.fn() as unknown as NextFunction;

    await verifyAuth0Token(request('Bearer invalid'), response(), next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token', details: {} },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets only the verified Auth0 context', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'auth0|coach-1' } } as never);
    const req = request('Bearer access-token');
    const next = vi.fn() as unknown as NextFunction;

    await verifyAuth0Token(req, response(), next);

    expect(createRemoteJWKSet).toHaveBeenCalledWith(
      new URL('https://athlora.eu.auth0.com/.well-known/jwks.json'),
    );
    expect(jwtVerify).toHaveBeenCalledWith('access-token', 'keyset', {
      issuer: 'https://athlora.eu.auth0.com/',
      audience: 'https://api.athlora.test',
    });
    expect(req.auth0).toEqual({ auth0Id: 'auth0|coach-1', accessToken: 'access-token' });
    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('resolveApplicationUser', () => {
  it('adds the typed application user context without replacing token context', async () => {
    const req = request();
    req.auth0 = { auth0Id: 'auth0|coach-1', accessToken: 'access-token' };
    query.mockResolvedValue({
      rows: [
        {
          user_id: '11111111-1111-4111-8111-111111111111',
          auth0_id: 'auth0|coach-1',
          role: 'coach',
        },
      ],
    });
    const next = vi.fn() as unknown as NextFunction;

    await resolveApplicationUser(req, response(), next);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE u.auth0_id = $1'), [
      'auth0|coach-1',
    ]);
    expect(req.auth).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      auth0Id: 'auth0|coach-1',
      role: 'coach',
    });
    expect(req.auth0).toEqual({ auth0Id: 'auth0|coach-1', accessToken: 'access-token' });
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks resource access while account deletion is pending', async () => {
    const req = request();
    req.auth0 = { auth0Id: 'auth0|coach-1', accessToken: 'access-token' };
    query.mockResolvedValue({
      rows: [{
        user_id: '11111111-1111-4111-8111-111111111111',
        auth0_id: 'auth0|coach-1',
        role: 'coach',
        deletion_status: 'pending',
      }],
    });
    const next = vi.fn() as unknown as NextFunction;

    await resolveApplicationUser(req, response(), next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 403,
      code: 'ACCOUNT_DELETION_PENDING',
    }));
  });

  it('keeps resource access blocked after an ambiguous deletion failure', async () => {
    const req = request();
    req.auth0 = { auth0Id: 'auth0|coach-1', accessToken: 'access-token' };
    query.mockResolvedValue({
      rows: [{
        user_id: '11111111-1111-4111-8111-111111111111',
        auth0_id: 'auth0|coach-1',
        role: 'coach',
        deletion_status: 'failed',
      }],
    });
    const next = vi.fn() as unknown as NextFunction;

    await resolveApplicationUser(req, response(), next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 403,
      code: 'ACCOUNT_DELETION_PENDING',
    }));
  });

  it('reports an unsynchronized verified identity with the sync endpoint', async () => {
    const req = request();
    req.auth0 = { auth0Id: 'auth0|new-coach', accessToken: 'access-token' };
    query.mockResolvedValue({ rows: [] });
    const next = vi.fn() as unknown as NextFunction;

    await resolveApplicationUser(req, response(), next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 403,
        code: 'AUTH_USER_NOT_SYNCHRONIZED',
        details: { syncEndpoint: '/api/v1/auth/me' },
      }),
    );
  });

  it('rejects an invalid persisted role before exposing typed context', async () => {
    const req = request();
    req.auth0 = { auth0Id: 'auth0|coach-1', accessToken: 'access-token' };
    query.mockResolvedValue({
      rows: [
        {
          user_id: '11111111-1111-4111-8111-111111111111',
          auth0_id: 'auth0|coach-1',
          role: 'administrator',
        },
      ],
    });
    const next = vi.fn() as unknown as NextFunction;

    await resolveApplicationUser(req, response(), next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, code: 'AUTH_CONTEXT_INVALID' }),
    );
  });
});

describe('typed context accessors', () => {
  it('returns non-optional contexts after the matching middleware stage', () => {
    const req = request();
    req.auth0 = { auth0Id: 'auth0|coach-1', accessToken: 'access-token' };
    req.auth = {
      userId: '11111111-1111-4111-8111-111111111111',
      auth0Id: 'auth0|coach-1',
      role: 'coach',
    };

    expect(getVerifiedAuth0Context(req)).toBe(req.auth0);
    expect(getApplicationUserContext(req)).toBe(req.auth);
  });

  it('uses the standard invariant error when context middleware was skipped', () => {
    const req = request();

    expect(() => getVerifiedAuth0Context(req)).toThrow(
      expect.objectContaining({ status: 500, code: 'AUTH_CONTEXT_MISSING' }),
    );
    expect(() => getApplicationUserContext(req)).toThrow(
      expect.objectContaining({ status: 500, code: 'AUTH_CONTEXT_MISSING' }),
    );
  });
});
