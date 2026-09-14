import type { RequestHandler } from 'express';
import { getApplicationUserContext } from './auth.js';
import { ApiError } from './errors.js';

export function requireCoach(): RequestHandler {
  return (req, _res, next) => {
    try {
      if (getApplicationUserContext(req).workspaceRole !== 'coach') {
        throw new ApiError(403, 'WORKSPACE_CAPABILITY_DENIED', 'Coach access is required');
      }
      next();
    } catch (error) { next(error); }
  };
}

export function requireOperationalAccess(): RequestHandler {
  return (req, _res, next) => {
    try {
      const { workspaceRole } = getApplicationUserContext(req);
      if (workspaceRole !== 'coach' && workspaceRole !== 'assistant') {
        throw new ApiError(403, 'WORKSPACE_CAPABILITY_DENIED', 'Operational access is required');
      }
      next();
    } catch (error) { next(error); }
  };
}

export const requireCurrentWorkspace: RequestHandler = (req, _res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    if (req.params.workspaceId !== workspaceId) {
      throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
    }
    next();
  } catch (error) { next(error); }
};
