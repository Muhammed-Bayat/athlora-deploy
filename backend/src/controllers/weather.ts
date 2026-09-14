import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { getCurrentWeather as loadCurrentWeather } from '../services/weather.js';
import { parseWeatherCurrentQuery } from '../validation/payloads.js';

export const getCurrentWeather: RequestHandler = async (req, res, next) => {
  try {
    getApplicationUserContext(req);
    const query = parseWeatherCurrentQuery(req.query as Record<string, unknown>);
    const weather = await loadCurrentWeather(query.latitude, query.longitude);
    res.json({ data: weather });
  } catch (error) {
    next(error);
  }
};