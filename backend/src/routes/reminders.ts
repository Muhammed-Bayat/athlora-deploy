import { Router } from 'express';
import * as reminders from '../controllers/reminders.js';

const router = Router();
router.get('/', reminders.list);
router.get('/unread-count', reminders.unreadCount);
router.post('/:reminderId/read', reminders.markRead);

export default router;
