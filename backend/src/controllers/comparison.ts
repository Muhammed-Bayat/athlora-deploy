import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  getCrossClubAthleteComparison,
  getTwoAthleteComparison,
} from '../services/comparison.js';
import { ApiError } from '../middleware/errors.js';

export const getComparison: RequestHandler = async (req, res, next) => {
  try {
    const scope = req.query.scope;
    if (scope !== undefined && scope !== 'cross-club') {
      throw new ApiError(422, 'COMPARISON_SCOPE_INVALID', 'Scope must be cross-club');
    }

    const comparison = scope === 'cross-club'
      ? await getCrossClubAthleteComparison(req.query.athlete1Id, req.query.athlete2Id)
      : await getTwoAthleteComparison(
        getApplicationUserContext(req).workspaceId,
        req.query.athlete1Id,
        req.query.athlete2Id,
      );
    res.json({ data: comparison });
  } catch (error) {
    next(error);
  }
};
