import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

router.get('/login', notImplemented);
router.get('/callback', notImplemented);
router.get('/logout', notImplemented);

export default router;