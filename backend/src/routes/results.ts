import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';

const router = Router();

router.get('/:eventId/results', notImplemented);
router.put('/:eventId/results/:athleteId', notImplemented);

export default router;