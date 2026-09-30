import type { RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  getAthleteDisciplineAnalytics,
  getWorkspaceDisciplineAnalytics,
} from '../services/athleteAnalytics.js';
import { parseSeasonYear } from '../services/seasons.js';

export const getAthleteDisciplineAnalysis: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const analysis = await getAthleteDisciplineAnalytics(
      workspaceId,
      req.params.id,
      req.params.discipline,
      parseSeasonYear(req.query.year),
      getPool(),
    );
    res.json({ data: analysis });
  } catch (error) {
    next(error);
  }
};

export const getWorkspaceDisciplineAnalysis: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const analysis = await getWorkspaceDisciplineAnalytics(
      workspaceId,
      req.params.discipline,
      parseSeasonYear(req.query.year),
      getPool(),
    );
    res.json({ data: analysis });
  } catch (error) {
    next(error);
  }
};
