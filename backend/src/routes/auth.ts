import { Router } from 'express';
import { syncCurrentUser } from '../controllers/auth.js';
import { verifyAuth0Token } from '../middleware/auth.js';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

router.get('/login', notImplemented);
router.get('/callback', notImplemented);
router.get('/logout', notImplemented);
router.put('/me', verifyAuth0Token, syncCurrentUser);

export default router;
