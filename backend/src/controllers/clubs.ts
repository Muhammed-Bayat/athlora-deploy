import type { RequestHandler } from 'express';
import { getApplicationUserContext, getLocalApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import {
  createClub,
  createJoinRequest,
  listClubJoinRequests,
  listClubs,
  listMyJoinRequests,
  reviewJoinRequest,
  withdrawJoinRequest,
} from '../services/clubs.js';
import { normalizeRequiredString } from '../validation/primitives.js';

function parameter(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}

export const list: RequestHandler = async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null;
    const clubs = await listClubs(search);
    res.json({ data: clubs, meta: { count: clubs.length } });
  } catch (error) { next(error); }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const name = normalizeRequiredString(req.body?.name);
    if (!name) throw new ApiError(422, 'CLUB_NAME_INVALID', 'Club name is required');
    const club = await createClub(getLocalApplicationUserContext(req).userId, name);
    res.status(201).json({ data: club });
  } catch (error) { next(error); }
};

export const requestJoin: RequestHandler = async (req, res, next) => {
  try {
    const request = await createJoinRequest(parameter(req.params.clubId), getLocalApplicationUserContext(req).userId);
    res.status(201).json({ data: request });
  } catch (error) { next(error); }
};

export const listMine: RequestHandler = async (req, res, next) => {
  try {
    const requests = await listMyJoinRequests(getLocalApplicationUserContext(req).userId);
    res.json({ data: requests, meta: { count: requests.length } });
  } catch (error) { next(error); }
};

export const withdraw: RequestHandler = async (req, res, next) => {
  try {
    await withdrawJoinRequest(parameter(req.params.id), getLocalApplicationUserContext(req).userId);
    res.status(204).end();
  } catch (error) { next(error); }
};

export const listJoinRequests: RequestHandler = async (req, res, next) => {
  try {
    const requests = await listClubJoinRequests(parameter(req.params.clubId));
    res.json({ data: requests, meta: { count: requests.length } });
  } catch (error) { next(error); }
};

export const approve: RequestHandler = async (req, res, next) => {
  try {
    const role = req.body?.role;
    if (!['coach', 'assistant'].includes(role)) throw new ApiError(422, 'CLUB_JOIN_REQUEST_ROLE_INVALID', 'Role must be coach or assistant');
    const request = await reviewJoinRequest(parameter(req.params.clubId), parameter(req.params.id), getApplicationUserContext(req).userId, 'approved', role);
    res.json({ data: request });
  } catch (error) { next(error); }
};

export const reject: RequestHandler = async (req, res, next) => {
  try {
    const request = await reviewJoinRequest(parameter(req.params.clubId), parameter(req.params.id), getApplicationUserContext(req).userId, 'rejected');
    res.json({ data: request });
  } catch (error) { next(error); }
};
