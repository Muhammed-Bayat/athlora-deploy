import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import {
  createTimelineEntry as createEntry,
  listTimelineEntries as listEntries,
  removeTimelineEntry as removeEntry,
  updateTimelineEntry as updateEntry,
} from '../services/timeline.js';

export const listTimelineEntries: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const entries = await listEntries(workspaceId, req.params.eventId);
    res.json({ data: entries, meta: { count: entries.length } });
  } catch (error) {
    next(error);
  }
};

export const createTimelineEntry: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const entry = await createEntry(userId, req.params.eventId, req.body, undefined, workspaceId);
    res.status(201).json({ data: entry });
  } catch (error) {
    next(error);
  }
};

export const updateTimelineEntry: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    const entry = await updateEntry(workspaceId, req.params.eventId, req.params.entryId, req.body);
    res.json({ data: entry });
  } catch (error) {
    next(error);
  }
};

export const removeTimelineEntry: RequestHandler = async (req, res, next) => {
  try {
    const { workspaceId } = getApplicationUserContext(req);
    await removeEntry(workspaceId, req.params.eventId, req.params.entryId, req.body);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
