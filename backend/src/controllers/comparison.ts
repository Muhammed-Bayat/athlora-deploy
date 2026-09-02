import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getTwoAthleteComparison } from '../services/comparison.js';

export const getComparison: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const comparison = await getTwoAthleteComparison(
      workspaceId,
      req.query.athlete1Id,
      req.query.athlete2Id,
    );
    res.json({ data: comparison });
  } catch (error) {
    next(error);
  }
};
