import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { listWorkspaces } from '../services/workspaces.js';

export const listAccessibleWorkspaces: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const workspaces = await listWorkspaces(userId);
    res.json({ data: workspaces, meta: { count: workspaces.length, activeWorkspaceId: workspaceId } });
  } catch (error) {
    next(error);
  }
};
