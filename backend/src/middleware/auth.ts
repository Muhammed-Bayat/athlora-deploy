import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { RequestHandler } from 'express';

function keyset(domain: string) {
  return createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
}

export const requireAuth: RequestHandler = async (req, res, next) => {
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
    req.user = { sub: payload.sub };
    req.accessToken = token;
    next();
  } catch {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token', details: {} },
    });
  }
};
