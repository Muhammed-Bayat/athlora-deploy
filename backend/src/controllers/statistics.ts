import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getAthleteStatisticsDetail } from '../services/statistics.js';

export const getAthleteStatistics: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const statistics = await getAthleteStatisticsDetail(workspaceId, req.params.id);
    res.json({ data: statistics });
  } catch (error) {
    next(error);
  }
};
