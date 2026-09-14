import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getAthleteStatisticsDetail } from '../services/statistics.js';
import { getAthleteProgressionDetail } from '../services/progression.js';
import { parseAthleteProgressionQuery } from '../validation/payloads.js';
import { parseSeasonYear } from '../services/seasons.js';

export const getAthleteStatistics: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const statistics = req.query.year === undefined
      ? await getAthleteStatisticsDetail(workspaceId, req.params.id)
      : await getAthleteStatisticsDetail(workspaceId, req.params.id, undefined, undefined, parseSeasonYear(req.query.year));
    res.json({ data: statistics });
  } catch (error) {
    next(error);
  }
};

export const getAthleteProgression: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const query = parseAthleteProgressionQuery(req.query);
    const progression = await getAthleteProgressionDetail(
      workspaceId,
      req.params.id,
      query,
    );
    res.json({ data: progression });
  } catch (error) {
    next(error);
  }
};
