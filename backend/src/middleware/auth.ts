import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { RequestHandler } from 'express';

function keyset() {
  const domain = process.env.AUTH0_DOMAIN;
  if (!domain) return null;
  return createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const jwks = keyset();
  if (!jwks) {
    res.status(503).json({
      error: { code: 'AUTH_NOT_CONFIGURED', message: 'AUTH0_DOMAIN is not configured', details: {} },
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

  const domain = process.env.AUTH0_DOMAIN as string;
  const audience = process.env.AUTH0_AUDIENCE;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${domain}/`,
      ...(audience ? { audience } : {}),
    });
    req.user = { sub: payload.sub };
    next();
  } catch {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token', details: {} },
    });
  }
};