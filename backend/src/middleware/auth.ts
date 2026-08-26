import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { ApiError } from './errors.js';
import type { ApplicationUserContext, VerifiedAuth0Context } from '../types/auth.js';
import { isCanonicalUuid } from '../validation/primitives.js';

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
    const requestedWorkspaceId = typeof req.header === 'function' ? req.header('X-Workspace-Id') : undefined;
    if (requestedWorkspaceId !== undefined && !isCanonicalUuid(requestedWorkspaceId)) {
      next(new ApiError(400, 'WORKSPACE_ID_INVALID', 'Workspace ID must be a UUID'));
      return;
    }
    const result = await getPool().query<{
      user_id: string;
      auth0_id: string;
      role: ApplicationUserContext['role'];
      deletion_status: string | null;
      workspace_id: string;
      workspace_role: ApplicationUserContext['workspaceRole'];
    }>(
      `SELECT u.id AS user_id, u.auth0_id, u.role, d.status AS deletion_status,
              wm.workspace_id, wm.role AS workspace_role
       FROM users u
       LEFT JOIN account_deletions d ON d.auth0_id = u.auth0_id
       JOIN workspace_members wm ON wm.user_id = u.id
       WHERE u.auth0_id = $1
         AND ($2::uuid IS NULL OR wm.workspace_id = $2::uuid)
       ORDER BY wm.created_at, wm.workspace_id
       LIMIT 1`,
      [auth0.auth0Id, requestedWorkspaceId ?? null],
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
    if (user.deletion_status) {
      next(new ApiError(403, 'ACCOUNT_DELETION_PENDING', 'Account deletion is in progress'));
      return;
    }
    if (!['coach', 'assistant'].includes(user.role) ||
        !['coach', 'assistant'].includes(user.workspace_role ?? user.role)) {
      next(new ApiError(500, 'AUTH_CONTEXT_INVALID', 'Application user context is invalid'));
      return;
    }

    req.auth = {
      userId: user.user_id,
      auth0Id: user.auth0_id,
      role: user.role,
      workspaceId: user.workspace_id ?? user.user_id,
      workspaceRole: user.workspace_role ?? user.role,
    };
    next();
  } catch (error) {
    next(error);
  }
};
