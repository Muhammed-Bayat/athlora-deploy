import type { RequestHandler } from 'express';
import { getPool } from '../db/client.js';
import { getPublicLeaderboard } from '../services/leaderboard.js';

export const leaderboard: RequestHandler = async (req, res, next) => {
  try {
    const query = {
      discipline: typeof req.query.discipline === 'string' ? req.query.discipline : undefined,
      season: typeof req.query.season === 'string' ? req.query.season : undefined,
      age: typeof req.query.age === 'string' ? req.query.age : undefined,
      gender: typeof req.query.gender === 'string' ? req.query.gender : undefined,
      club: typeof req.query.club === 'string' ? req.query.club : undefined,
    };
    const data = await getPublicLeaderboard(query, getPool());
    res.json({ data, meta: { count: data.length } });
  } catch (error) {
    next(error);
  }
};
