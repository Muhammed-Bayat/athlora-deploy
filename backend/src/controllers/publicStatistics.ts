import type { RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import { getPublicClubStatistics, listPublicClubs } from '../services/publicStatistics.js';

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

export const clubStatistics: RequestHandler = async (req, res, next) => {
  try {
    const statistics = await getPublicClubStatistics(parameter(req.params.clubId));
    res.json({ data: statistics });
  } catch (error) { next(error); }
};
