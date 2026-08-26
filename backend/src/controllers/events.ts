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
    const { workspaceId } = getApplicationUserContext(req);
    const events = await listEventsRecords(workspaceId, query);
    res.json({ data: events, meta: { count: events.length } });
  } catch (error) {
    next(error);
  }
};

export const getEvent: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const event = await getEventRecord(workspaceId, req.params.id);
    res.json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const createEvent: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const event = await createEventRecord(userId, req.body, undefined, workspaceId);
    res.status(201).json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const updateEvent: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const event = await replaceEvent(workspaceId, req.params.id, req.body);
    res.json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const deleteEvent: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const event = await cancelEventRecord(workspaceId, req.params.id);
    res.json({ data: event });
  } catch (error) {
    next(error);
  }
};

export const getWeather: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const forecast = await getEventWeatherForecast(workspaceId, req.params.id);
    res.json({ data: forecast });
  } catch (error) {
    next(error);
  }
};
