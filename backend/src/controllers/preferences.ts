import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  getDashboardPreferences,
  replaceDashboardPreferences,
} from '../services/preferences.js';
import type { UserPreferences } from '../types/domain.js';

export const getPreferences: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const preferences = await getDashboardPreferences(userId, workspaceId);
    res.json({ data: preferences });
  } catch (error) { next(error); }
};

export const putPreferences: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const preferences = await replaceDashboardPreferences(userId, workspaceId, req.body as UserPreferences);
    res.json({ data: preferences });
  } catch (error) { next(error); }
};
