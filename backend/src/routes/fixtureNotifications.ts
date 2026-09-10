import { Router } from 'express';
import * as notifications from '../controllers/fixtureNotifications.js';

const router = Router();
router.get('/', notifications.list);
router.get('/unread-count', notifications.unreadCount);
router.post('/:notificationId/read', notifications.markRead);
router.delete('/:notificationId', notifications.deleteNotification);
router.post('/:notificationId/star', notifications.starNotification);
router.post('/:notificationId/unstar', notifications.unstarNotification);

export default router;
