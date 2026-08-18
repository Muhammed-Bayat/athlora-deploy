import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  cancelEvent as cancelEventRecord,
  createEvent as createEventRecord,
  getEvent as getEventRecord,
  listEvents as listEventsRecords,
  replaceEvent,
} from '../services/events.js';
import { parseEventListQuery } from '../validation/payloads.js';
import { getEventWeatherForecast } from '../services/weather.js';

export const listEvents: RequestHandler = async (req, res, next) => {
  try {
    const query = parseEventListQuery(req.query as Record<string, unknown>);
    const { userId } = getApplicationUserContext(req);
    const events = await listEventsRecords(userId, query);
    res.json({ data: events, meta: { count: events.length } });
  } catch (error) {
    next(error);
  }
};

export const getEvent: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const event = await getEventRecord(userId, req.params.id);
    res.json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const createEvent: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const event = await createEventRecord(userId, req.body);
    res.status(201).json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const updateEvent: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const event = await replaceEvent(userId, req.params.id, req.body);
    res.json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const deleteEvent: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const event = await cancelEventRecord(userId, req.params.id);
    res.json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const getWeather: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const forecast = await getEventWeatherForecast(userId, req.params.id);
    res.json({ data: forecast });
  } catch (error) {
    next(error);
  }
};
