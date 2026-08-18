import { Router } from 'express';
import { createPasswordTicket, deleteCurrentAccount, syncCurrentUser } from '../controllers/auth.js';
import { resolveApplicationUser, verifyAuth0Token } from '../middleware/auth.js';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

router.get('/login', notImplemented);
router.get('/callback', notImplemented);
router.get('/logout', notImplemented);
router.put('/me', verifyAuth0Token, syncCurrentUser);
router.post('/me/password-ticket', verifyAuth0Token, resolveApplicationUser, createPasswordTicket);
router.delete('/me', verifyAuth0Token, deleteCurrentAccount);

export default router;
