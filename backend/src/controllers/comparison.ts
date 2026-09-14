import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  getCrossClubAthleteComparison,
  getCrossClubMultiAthleteComparison,
  getMultiAthleteComparison,
  getTwoAthleteComparison,
} from '../services/comparison.js';
import { ApiError } from '../middleware/errors.js';
import { parseSeasonYear } from '../services/seasons.js';

export const getComparison: RequestHandler = async (req, res, next) => {
  try {
    const scope = req.query.scope;
    if (scope !== undefined && scope !== 'cross-club') {
      throw new ApiError(422, 'COMPARISON_SCOPE_INVALID', 'Scope must be cross-club');
    }

    const comparison = scope === 'cross-club'
      ? (req.query.year === undefined
        ? await getCrossClubAthleteComparison(req.query.athlete1Id, req.query.athlete2Id)
        : await getCrossClubAthleteComparison(req.query.athlete1Id, req.query.athlete2Id, undefined, parseSeasonYear(req.query.year)))
      : (req.query.year === undefined
        ? await getTwoAthleteComparison(getApplicationUserContext(req).workspaceId, req.query.athlete1Id, req.query.athlete2Id)
        : await getTwoAthleteComparison(getApplicationUserContext(req).workspaceId, req.query.athlete1Id, req.query.athlete2Id, undefined, parseSeasonYear(req.query.year)));
    res.json({ data: comparison });
  } catch (error) {
    next(error);
  }
};

export const getMultiComparison: RequestHandler = async (req, res, next) => {
  try {
    const scope = req.query.scope;
    if (scope !== undefined && scope !== 'cross-club') {
      throw new ApiError(422, 'COMPARISON_SCOPE_INVALID', 'Scope must be cross-club');
    }

    const comparison = scope === 'cross-club'
      ? (req.query.year === undefined
        ? await getCrossClubMultiAthleteComparison(req.query.athleteId)
        : await getCrossClubMultiAthleteComparison(req.query.athleteId, undefined, parseSeasonYear(req.query.year)))
      : (req.query.year === undefined
        ? await getMultiAthleteComparison(getApplicationUserContext(req).workspaceId, req.query.athleteId)
        : await getMultiAthleteComparison(getApplicationUserContext(req).workspaceId, req.query.athleteId, undefined, parseSeasonYear(req.query.year)));
    res.json({ data: comparison });
  } catch (error) {
    next(error);
  }
};
