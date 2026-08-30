import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  addEventParticipant as addParticipant,
  acknowledgeParticipantStatusReview as acknowledgeReview,
  listEventParticipants as listParticipants,
  removeEventParticipant as removeParticipant,
  replaceEventParticipant as replaceParticipant,
} from '../services/participants.js';

export const listEventParticipants: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const participants = await listParticipants(workspaceId, req.params.eventId);
    res.json({ data: participants, meta: { count: participants.length } });
  } catch (error) {
    next(error);
  }
};

export const addEventParticipant: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const participant = await addParticipant(workspaceId, req.params.eventId, req.body);
    res.status(201).json({ data: participant });
  } catch (error) {
    next(error);
  }
};

export const updateEventParticipant: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const participant = await replaceParticipant(
      workspaceId,
      req.params.eventId,
      req.params.athleteId,
      req.body,
    );
    res.json({ data: participant });
  } catch (error) {
    next(error);
  }
};

export const removeEventParticipant: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    await removeParticipant(workspaceId, req.params.eventId, req.params.athleteId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const acknowledgeParticipantStatusReview: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = getApplicationUserContext(req);
    await acknowledgeReview(workspaceId, userId, req.params.eventId, req.params.athleteId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
