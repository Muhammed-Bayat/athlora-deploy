import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getDashboardSummary as loadDashboardSummary } from '../services/dashboard.js';
import { parseSeasonYear } from '../services/seasons.js';

export const getDashboardSummary: RequestHandler = async (_req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(_req);
    const dashboard = _req.query.year === undefined
      ? await loadDashboardSummary(workspaceId)
      : await loadDashboardSummary(workspaceId, undefined, undefined, parseSeasonYear(_req.query.year));
    res.json({ data: dashboard });
  } catch (error) {
    next(error);
  }
};
