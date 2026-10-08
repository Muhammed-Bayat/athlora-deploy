import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

function jsonLimit(options: { windowMs: number; limit: number; code: string; message: string }): RequestHandler {
  if (process.env.NODE_ENV === 'test') {
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: options.code, message: options.message, details: {} } });
    },
  });
}

export const apiLimiter = jsonLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  code: 'RATE_LIMITED',
  message: 'Too many requests, please try again later',
});

export const aiTokenLimiter = jsonLimit({
  windowMs: 15 * 60 * 1000,
  limit: 45,
  code: 'RATE_LIMITED',
  message: 'Too many AI token requests, please try again later',
});

export const publicApiLimiter = jsonLimit({
  windowMs: 60 * 1000,
  limit: 120,
  code: 'RATE_LIMITED',
  message: 'Too many requests, please slow down',
});

export const authSyncLimiter = jsonLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  code: 'RATE_LIMITED',
  message: 'Too many account sync attempts, please try again later',
});
