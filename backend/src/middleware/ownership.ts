import type { Request, RequestHandler } from 'express';
import { getApplicationUserContext } from './auth.js';
import { assertEventLoggingOpen } from '../services/events.js';
import {
  assertAthleteOwnership,
  assertEventAthleteOwnership,
  assertEventOwnership,
  assertResultOwnership,
  assertTimelineEntryOwnership,
} from '../services/ownership.js';

type OwnershipCheck = (req: Request, userId: string) => Promise<void>;

function ownershipGuard(check: OwnershipCheck): RequestHandler {
  return async (req, _res, next) => {
    try {
      const { userId } = getApplicationUserContext(req);
      await check(req, userId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAthleteOwnership = ownershipGuard((req, userId) =>
  assertAthleteOwnership(userId, req.params.id),
);

export function requireEventOwnership(parameter = 'id'): RequestHandler {
  return ownershipGuard((req, userId) => assertEventOwnership(userId, req.params[parameter]));
}

export const requireEventAthleteOwnership = ownershipGuard((req, userId) =>
  assertEventAthleteOwnership(userId, req.params.eventId, req.body?.athleteId),
);

export const requireTimelineEntryOwnership = ownershipGuard((req, userId) =>
  assertTimelineEntryOwnership(userId, req.params.eventId, req.params.entryId),
);

export const requireEventLoggingOpen = ownershipGuard((req, userId) =>
  assertEventLoggingOpen(userId, req.params.eventId),
);

export const requireResultOwnership = ownershipGuard((req, userId) =>
  assertResultOwnership(userId, req.params.eventId, req.params.athleteId),
);
