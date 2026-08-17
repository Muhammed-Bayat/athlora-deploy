import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getDashboardSummary as loadDashboardSummary } from '../services/dashboard.js';

export const getDashboardSummary: RequestHandler = async (_req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(_req);
    const dashboard = await loadDashboardSummary(userId);
    res.json({ data: dashboard });
  } catch (error) {
    next(error);
  }
};
