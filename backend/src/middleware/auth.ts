import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import {
  DatabaseMappingError,
  mapApplicationUserContextRow,
  type ApplicationUserContextRow,
} from '../db/row-mappers.js';
import { ApiError } from './errors.js';
import type { ApplicationUserContext, VerifiedAuth0Context } from '../types/auth.js';

export function getVerifiedAuth0Context(req: Request): VerifiedAuth0Context {
  if (!req.auth0) {
    throw new ApiError(500, 'AUTH_CONTEXT_MISSING', 'Verified authentication context is missing');
  }

  return req.auth0;
}

export function getApplicationUserContext(req: Request): ApplicationUserContext {
  if (!req.auth) {
    throw new ApiError(500, 'AUTH_CONTEXT_MISSING', 'Application user context is missing');
  }

  return req.auth;
}

function keyset(domain: string) {
  return createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
}

export const verifyAuth0Token: RequestHandler = async (req, res, next) => {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  if (!domain || !audience) {
    res.status(503).json({
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Auth0 domain and audience are not configured',
        details: {},
      },
    });
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing bearer token', details: {} },
    });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, keyset(domain), {
      issuer: `https://${domain}/`,
      audience,
    });
    if (!payload.sub) {
      throw new Error('Token subject is missing');
    }
    req.auth0 = { auth0Id: payload.sub, accessToken: token };
    next();
  } catch {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token', details: {} },
    });
  }
};

export const requireAuth = verifyAuth0Token;

export const resolveApplicationUser: RequestHandler = async (req, _res, next) => {
  try {
    const auth0 = getVerifiedAuth0Context(req);
    const result = await getPool().query<ApplicationUserContextRow>(
      `SELECT id AS user_id, auth0_id, role
       FROM users
       WHERE auth0_id = $1`,
      [auth0.auth0Id],
    );
    const user = result.rows[0];

    if (!user) {
      next(
        new ApiError(
          403,
          'AUTH_USER_NOT_SYNCHRONIZED',
          'Authenticated user is not synchronized',
          { syncEndpoint: '/api/v1/auth/me' },
        ),
      );
      return;
    }

    try {
      req.auth = mapApplicationUserContextRow(user);
    } catch (error) {
      if (error instanceof DatabaseMappingError) {
        throw new ApiError(500, 'AUTH_CONTEXT_INVALID', 'Application user context is invalid');
      }
      throw error;
    }
    next();
  } catch (error) {
    next(error);
  }
};
