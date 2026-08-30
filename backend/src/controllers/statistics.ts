import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getAthleteStatisticsDetail } from '../services/statistics.js';
import { getAthleteProgressionDetail } from '../services/progression.js';

export const getAthleteStatistics: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const statistics = await getAthleteStatisticsDetail(workspaceId, req.params.id);
    res.json({ data: statistics });
  } catch (error) {
    next(error);
  }
};

export const getAthleteProgression: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const progression = await getAthleteProgressionDetail(workspaceId, req.params.id, {
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
    });
    res.json({ data: progression });
  } catch (error) {
    next(error);
  }
};
