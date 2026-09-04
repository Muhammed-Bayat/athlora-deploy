import type { RequestHandler } from 'express';
import { getApplicationUserContext } from '../middleware/auth.js';
import { countUnreadFixtureNotifications, listFixtureNotifications, markFixtureNotificationRead } from '../services/fixtureNotifications.js';

export const list: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    const notifications = await listFixtureNotifications(userId, workspaceId);
    res.json({ data: notifications, meta: { count: notifications.length } });
  } catch (error) { next(error); }
};

export const unreadCount: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    res.json({ data: { count: await countUnreadFixtureNotifications(userId, workspaceId) } });
  } catch (error) { next(error); }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    const { userId, workspaceId } = getApplicationUserContext(req);
    await markFixtureNotificationRead(userId, workspaceId, req.params.notificationId);
    res.status(204).end();
  } catch (error) { next(error); }
};
