import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import {
  createPublicLoggerEntry,
  createPublicLoggerLink,
  createPublicLoggerSession,
  createPublicLoggerSessionByEvent,
  listPublicLoggerLinks,
  publicLoggerSnapshot,
  revokePublicLoggerLink,
} from '../services/publicLoggers.js';

const SESSION_ATTEMPT_WINDOW_MS = 15 * 60_000;
const SESSION_ATTEMPT_LIMIT = 12;
const sessionAttempts = new Map<string, { count: number; resetAt: number }>();

function assertSessionRateLimit(req: Parameters<RequestHandler>[0]): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const attempt = sessionAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    sessionAttempts.set(key, { count: 1, resetAt: now + SESSION_ATTEMPT_WINDOW_MS });
    return;
  }
  if (attempt.count >= SESSION_ATTEMPT_LIMIT) {
    throw new ApiError(429, 'PUBLIC_LOGGER_RATE_LIMITED', 'Too many public logger session attempts. Please try again later.');
  }
  attempt.count += 1;
}

function sessionToken(req: Parameters<RequestHandler>[0]): string | null {
  const value = req.header('X-Public-Logger-Session');
  return value && value.trim() ? value.trim() : null;
}

function parameter(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export const createLink: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const result = await createPublicLoggerLink(workspaceId, parameter(req.params.eventId), userId);
    res.status(201).json({ data: result });
  } catch (error) { next(error); }
};

export const listLinks: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const links = await listPublicLoggerLinks(workspaceId, parameter(req.params.eventId));
    res.json({ data: links, meta: { count: links.length } });
  } catch (error) { next(error); }
};

export const revokeLink: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    await revokePublicLoggerLink(workspaceId, parameter(req.params.eventId), parameter(req.params.linkId));
    res.status(204).end();
  } catch (error) { next(error); }
};

export const startSession: RequestHandler = async (req, res, next) => {
  try {
    assertSessionRateLimit(req);
    const result = await createPublicLoggerSession(req.body.linkToken, req.body.name, req.body.club);
    res.status(201).json({ data: result });
  } catch (error) { next(error); }
};

export const startSessionByEvent: RequestHandler = async (req, res, next) => {
  try {
    assertSessionRateLimit(req);
    const result = await createPublicLoggerSessionByEvent(
      parameter(req.params.eventId),
      req.body.name,
      req.body.club,
    );
    res.status(201).json({ data: result });
  } catch (error) { next(error); }
};

export const getSnapshot: RequestHandler = async (req, res, next) => {
  try {
    const token = sessionToken(req);
    if (!token) throw new ApiError(401, 'PUBLIC_LOGGER_SESSION_INVALID', 'Public logger access is unavailable');
    res.json({ data: await publicLoggerSnapshot(token, parameter(req.params.eventId)) });
  } catch (error) { next(error); }
};

export const createEntry: RequestHandler = async (req, res, next) => {
  try {
    const token = sessionToken(req);
    if (!token) throw new ApiError(401, 'PUBLIC_LOGGER_SESSION_INVALID', 'Public logger access is unavailable');
    res.status(201).json({ data: await createPublicLoggerEntry(token, parameter(req.params.eventId), req.body) });
  } catch (error) { next(error); }
};
