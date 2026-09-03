import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getAthleteStatisticsDetail } from '../services/statistics.js';
import { getAthleteProgressionDetail } from '../services/progression.js';
import { parseAthleteProgressionQuery } from '../validation/payloads.js';

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
    const progression = await getAthleteProgressionDetail(
      workspaceId,
      req.params.id,
      parseAthleteProgressionQuery(req.query),
    );
    res.json({ data: progression });
  } catch (error) {
    next(error);
  }
};
