import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { countUnreadEventReminders, listEventReminders, markEventReminderRead } from '../services/reminders.js';

export const list: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const reminders = await listEventReminders(userId, workspaceId);
    res.json({ data: reminders, meta: { count: reminders.length } });
  } catch (error) { next(error); }
};

export const unreadCount: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    res.json({ data: { count: await countUnreadEventReminders(userId, workspaceId) } });
  } catch (error) { next(error); }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    await markEventReminderRead(userId, workspaceId, req.params.reminderId);
    res.status(204).end();
  } catch (error) { next(error); }
};
