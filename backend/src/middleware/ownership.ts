import type { Request, RequestHandler } from 'express';
import { getApplicationUserContext } from './auth.js';
import { assertEventLoggingOpen } from '../services/events.js';
import {
  assertAthleteOwnership,
  assertEventAthleteOwnership,
  assertEventOwnership,
  assertParticipantOwnership,
  assertResultOwnership,
  assertTimelineEntryOwnership,
} from '../services/ownership.js';

type OwnershipCheck = (req: Request, workspaceId: string) => Promise<void>;

function ownershipGuard(check: OwnershipCheck): RequestHandler {
  return async (req, _res, next) => {
    try {
      const { workspaceId } = getApplicationUserContext(req);
      await check(req, workspaceId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAthleteOwnership = ownershipGuard((req, workspaceId) =>
  assertAthleteOwnership(workspaceId, req.params.id),
);

export function requireEventOwnership(parameter = 'id'): RequestHandler {
  return ownershipGuard((req, workspaceId) => assertEventOwnership(workspaceId, req.params[parameter]));
}

export const requireEventAthleteOwnership = ownershipGuard((req, workspaceId) =>
  assertEventAthleteOwnership(workspaceId, req.params.eventId, req.body?.athleteId),
);

export const requireParticipantOwnership = ownershipGuard((req, workspaceId) =>
  assertParticipantOwnership(workspaceId, req.params.eventId, req.params.athleteId),
);

export const requireTimelineEntryOwnership = ownershipGuard((req, workspaceId) =>
  assertTimelineEntryOwnership(workspaceId, req.params.eventId, req.params.entryId),
);

export const requireEventLoggingOpen = ownershipGuard((req, workspaceId) =>
  assertEventLoggingOpen(workspaceId, req.params.eventId),
);

export const requireResultOwnership = ownershipGuard((req, workspaceId) =>
  assertResultOwnership(workspaceId, req.params.eventId, req.params.athleteId),
);
