import type { RequestHandler } from 'express';
import { searchVenues } from '../services/venues.js';
import { parseVenueSearchQuery } from '../validation/payloads.js';

export const search: RequestHandler = async (req, res, next) => {
  try {
    const { q } = parseVenueSearchQuery(req.query as Record<string, unknown>);
    const venues = await searchVenues(q);
    res.json({ data: venues, meta: { count: venues.length } });
  } catch (error) {
    next(error);
  }
};
