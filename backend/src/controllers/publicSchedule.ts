import type { RequestHandler } from 'express';
import { ApiError } from '../middleware/errors.js';
import { getPublicClubSchedule, listPublicScheduleClubs } from '../services/publicSchedule.js';

function parameter(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}

export const listClubs: RequestHandler = async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null;
    const clubs = await listPublicScheduleClubs(search);
    res.json({ data: clubs, meta: { count: clubs.length } });
  } catch (error) { next(error); }
};

export const clubSchedule: RequestHandler = async (req, res, next) => {
  try {
    const schedule = await getPublicClubSchedule(parameter(req.params.clubId));
    res.json({ data: schedule });
  } catch (error) { next(error); }
};
