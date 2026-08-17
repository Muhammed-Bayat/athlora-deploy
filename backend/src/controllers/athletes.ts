import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  createAthlete as createAthleteRecord,
  getAthlete as getAthleteRecord,
  listAthletes as listAthletesRecords,
  replaceAthlete,
  setAthleteArchived,
} from '../services/athletes.js';
import { parseAthleteListQuery } from '../validation/payloads.js';

export const listAthletes: RequestHandler = async (req, res, next) => {
  try {
    const query = parseAthleteListQuery(req.query as Record<string, unknown>);
    const { userId } = getApplicationUserContext(req);
    const athletes = await listAthletesRecords(userId, query);
    res.json({ data: athletes, meta: { count: athletes.length } });
  } catch (error) {
    next(error);
  }
};

export const getAthlete: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const athlete = await getAthleteRecord(userId, req.params.id);
    res.json({ data: athlete });
  } catch (error) {
    next(error);
  }
};

export const createAthlete: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const athlete = await createAthleteRecord(userId, req.body);
    res.status(201).json({ data: athlete });
  } catch (error) {
    next(error);
  }
};

export const updateAthlete: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const athlete = await replaceAthlete(userId, req.params.id, req.body);
    res.json({ data: athlete });
  } catch (error) {
    next(error);
  }
};

export const deleteAthlete: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const athlete = await setAthleteArchived(userId, req.params.id, true);
    res.json({ data: athlete });
  } catch (error) {
    next(error);
  }
};

export const unarchiveAthlete: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = getApplicationUserContext(req);
    const athlete = await setAthleteArchived(userId, req.params.id, false);
    res.json({ data: athlete });
  } catch (error) {
    next(error);
  }
};
