import { Router } from 'express';
import { notImplemented } from '../middleware/notImplemented.js';
import { requireEventOwnership, requireResultOwnership } from '../middleware/ownership.js';

const router = Router();

router.get('/:eventId/results', requireEventOwnership('eventId'), notImplemented);
router.put('/:eventId/results/:athleteId', requireResultOwnership, notImplemented);

export default router;
