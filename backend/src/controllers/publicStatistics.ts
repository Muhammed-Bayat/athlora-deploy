import type { RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import { getPublicAthleteComparison, getPublicClubStatistics, listPublicClubs, listPublicSeasons } from '../services/publicStatistics.js';
import { parseSeasonYear } from '../services/seasons.js';

function parameter(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}

export const listClubs: RequestHandler = async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null;
    const clubs = await listPublicClubs(search);
    res.json({ data: clubs, meta: { count: clubs.length } });
  } catch (error) { next(error); }
};

export const listSeasons: RequestHandler = async (_req, res, next) => {
  try {
    const years = await listPublicSeasons();
    res.json({ data: years, meta: { count: years.length } });
  } catch (error) { next(error); }
};

export const clubStatistics: RequestHandler = async (req, res, next) => {
  try {
    const statistics = req.query.year === undefined
      ? await getPublicClubStatistics(parameter(req.params.clubId))
      : await getPublicClubStatistics(parameter(req.params.clubId), parseSeasonYear(req.query.year));
    res.json({ data: statistics });
  } catch (error) { next(error); }
};

export const athleteComparison: RequestHandler = async (req, res, next) => {
  try {
    const comparison = req.query.year === undefined
      ? await getPublicAthleteComparison(req.query.athleteId)
      : await getPublicAthleteComparison(req.query.athleteId, parseSeasonYear(req.query.year));
    res.json({ data: comparison });
  } catch (error) { next(error); }
};
