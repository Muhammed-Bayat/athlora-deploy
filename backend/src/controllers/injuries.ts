import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { ApiError } from '../middleware/errors.js';
import {
  listInjuries,
  createInjury,
  updateInjury,
  resolveInjury,
  reopenInjury,
  deleteInjury,
} from '../services/injuries.js';
import {
  parseInjuryCreatePayload,
  parseInjuryUpdatePayload,
  parseInjuryResolvePayload,
  parseInjuryListQuery,
} from '../validation/payloads.js';

function parameter(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new ApiError(404, 'NOT_FOUND', 'Resource not found');
  return value;
}

export const listAthleteInjuries: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const query = parseInjuryListQuery(req.query);
    const injuries = await listInjuries(workspaceId, parameter(req.params.id), query);
    res.json({ data: injuries, meta: { count: injuries.length } });
  } catch (error) {
    next(error);
  }
};

export const createAthleteInjury: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const payload = parseInjuryCreatePayload(req.body);
    const injury = await createInjury(workspaceId, parameter(req.params.id), userId, payload);
    res.status(201).json({ data: injury });
  } catch (error) {
    next(error);
  }
};

export const updateAthleteInjury: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const payload = parseInjuryUpdatePayload(req.body);
    const injury = await updateInjury(
      workspaceId,
      parameter(req.params.id),
      parameter(req.params.injuryId),
      userId,
      payload,
    );
    res.json({ data: injury });
  } catch (error) {
    next(error);
  }
};

export const resolveAthleteInjury: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const payload = parseInjuryResolvePayload(req.body);
    const injury = await resolveInjury(
      workspaceId,
      parameter(req.params.id),
      parameter(req.params.injuryId),
      userId,
      payload,
    );
    res.json({ data: injury });
  } catch (error) {
    next(error);
  }
};

export const reopenAthleteInjury: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const injury = await reopenInjury(
      workspaceId,
      parameter(req.params.id),
      parameter(req.params.injuryId),
      userId,
    );
    res.json({ data: injury });
  } catch (error) {
    next(error);
  }
};

export const deleteAthleteInjury: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    const injury = await deleteInjury(
      workspaceId,
      parameter(req.params.id),
      parameter(req.params.injuryId),
      userId,
    );
    res.json({ data: injury });
  } catch (error) {
    next(error);
  }
};
