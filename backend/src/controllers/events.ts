import type { RequestHandler } from 'express';

export const listEvents: RequestHandler = (_req, res) => {
  res.json({ data: [], meta: { count: 0 } });
};

export const getEvent: RequestHandler = (_req, res) => {
  res.json({ data: null });
};

export const createEvent: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Event creation arrives in Stage 1', details: {} },
  });
};

export const updateEvent: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Event updates arrive in Stage 1', details: {} },
  });
};

export const deleteEvent: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Event deletion arrives in Stage 1', details: {} },
  });
};

export const getWeather: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Weather proxy arrives in Stage 1', details: {} },
  });
};