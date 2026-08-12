import type { RequestHandler } from 'express';

export const listAthletes: RequestHandler = (_req, res) => {
  res.json({ data: [], meta: { count: 0 } });
};

export const getAthlete: RequestHandler = (_req, res) => {
  res.json({ data: null });
};

export const createAthlete: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Athlete creation arrives in Stage 1', details: {} },
  });
};

export const updateAthlete: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Athlete updates arrive in Stage 1', details: {} },
  });
};

export const deleteAthlete: RequestHandler = (_req, res) => {
  res.status(501).json({
    error: { code: 'NOT_IMPLEMENTED', message: 'Athlete deletion arrives in Stage 1', details: {} },
  });
};