import { Router } from 'express';
import { syncCurrentUser } from '../controllers/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

router.get('/login', notImplemented);
router.get('/callback', notImplemented);
router.get('/logout', notImplemented);
router.put('/me', requireAuth, syncCurrentUser);

export default router;
